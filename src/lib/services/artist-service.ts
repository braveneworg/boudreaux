/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import 'server-only';

import { PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { Prisma } from '@prisma/client';

import { ArtistRepository } from '@/lib/repositories/artist-repository';
import { ImageRepository } from '@/lib/repositories/image-repository';
import type {
  Artist,
  ArtistListWithBio,
  ArtistWithPublishedReleases,
} from '@/lib/types/media-models';
import { generateSlug } from '@/lib/utils/generate-slug';
import { getS3Client } from '@/lib/utils/s3-client';
import { sanitizeBioHtml, sanitizeBioText } from '@/lib/utils/sanitize-bio-html';
import { splitFullName } from '@/lib/utils/split-full-name';

import type { ServiceResponse } from './service.types';

/**
 * Input data for uploading an image
 */
export interface ImageUploadInput {
  file: Buffer;
  fileName: string;
  contentType: string;
  caption?: string;
  altText?: string;
}

/**
 * Result of an image upload operation
 */
export interface ImageUploadResult {
  id: string;
  src: string;
  caption?: string;
  altText?: string;
  sortOrder: number;
}

/**
 * Generate a unique file key for S3
 */
const generateS3Key = (artistId: string, fileName: string): string => {
  const timestamp = Date.now();
  const randomSuffix = Math.random().toString(36).substring(2, 8);
  const extension = fileName.split('.').pop()?.toLowerCase() || 'jpg';
  const sanitizedName = fileName
    .replace(/\.[^/.]+$/, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '-')
    .substring(0, 50);

  return `media/artists/${artistId}/${sanitizedName}-${timestamp}-${randomSuffix}.${extension}`;
};

/**
 * Sanitizes the rich-text bio fields (`bio`, `shortBio`, `altBio`) before they
 * are persisted. All three are authored in the Tiptap editor, so they are HTML;
 * `sanitizeBioHtml` enforces the allowlist (and link hardening) on write so
 * every read surface can trust the stored markup. Only string values are
 * touched, leaving Prisma update operators (e.g. `{ set }`) and `null` intact.
 */
const sanitizeBioWriteFields = <T extends Prisma.ArtistCreateInput | Prisma.ArtistUpdateInput>(
  data: T
): T => {
  const sanitized = { ...data };
  if (typeof sanitized.bio === 'string') sanitized.bio = sanitizeBioHtml(sanitized.bio);
  if (typeof sanitized.shortBio === 'string')
    sanitized.shortBio = sanitizeBioHtml(sanitized.shortBio);
  if (typeof sanitized.altBio === 'string') sanitized.altBio = sanitizeBioHtml(sanitized.altBio);
  return sanitized;
};

export class ArtistService {
  /**
   * Create a new artist
   */
  static async createArtist(data: Prisma.ArtistCreateInput): Promise<ServiceResponse<Artist>> {
    try {
      const artist = (await ArtistRepository.create(
        sanitizeBioWriteFields(data)
      )) as unknown as Artist;
      return { success: true, data: artist };
    } catch (error) {
      // Unique constraint violations
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        return { success: false, error: 'Artist with this slug already exists' };
      }

      // Connection/network issues
      if (error instanceof Prisma.PrismaClientInitializationError) {
        console.error('Database connection failed:', error);
        return { success: false, error: 'Database unavailable' };
      }

      // Unknown errors
      console.error('Unexpected error:', error);
      return { success: false, error: 'Failed to create artist' };
    }
  }

  /**
   * Get an artist by ID
   */
  static async getArtistById(id: string): Promise<ServiceResponse<Artist>> {
    try {
      const artist = await ArtistRepository.findById(id);

      if (!artist) {
        return { success: false, error: 'Artist not found' };
      }

      return { success: true, data: artist };
    } catch (error) {
      if (error instanceof Prisma.PrismaClientInitializationError) {
        console.error('Database connection failed:', error);
        return { success: false, error: 'Database unavailable' };
      }

      console.error('Unexpected error:', error);
      return { success: false, error: 'Failed to retrieve artist' };
    }
  }

  /**
   * Get an artist by slug
   */
  static async getArtistBySlug(slug: string): Promise<ServiceResponse<Artist>> {
    try {
      const artist = (await ArtistRepository.findBySlug(slug)) as unknown as Artist | null;

      if (!artist) {
        return { success: false, error: 'Artist not found' };
      }

      return { success: true, data: artist };
    } catch (error) {
      if (error instanceof Prisma.PrismaClientInitializationError) {
        console.error('Database connection failed:', error);
        return { success: false, error: 'Database unavailable' };
      }

      console.error('Unexpected error:', error);
      return { success: false, error: 'Failed to retrieve artist' };
    }
  }

  /**
   * Get all artists with optional filters.
   *
   * Supports server-side `search` plus `published`/`deleted` filtering for the
   * admin listing. The search OR and the deletedOn OR are combined under `AND`
   * so the two `OR` keys never collide (Prisma 6 + MongoDB null-safe pattern).
   *
   * - `published === true` → only artists with a `publishedOn` date.
   * - `published === false` → only artists without a `publishedOn` date.
   * - `published == null` → no publish filter.
   * - `deleted` falsy → exclude soft-deleted artists; `deleted === true` → include them.
   */
  static async getArtists(params?: {
    skip?: number;
    take?: number;
    search?: string;
    published?: boolean;
    deleted?: boolean;
  }): Promise<ServiceResponse<Artist[]>> {
    try {
      const { skip = 0, take = 50, search, published, deleted } = params || {};

      const contains = (value: string) => ({ contains: value, mode: 'insensitive' as const });
      const and: Prisma.ArtistWhereInput[] = [];

      if (!deleted) {
        and.push({ OR: [{ deletedOn: null }, { deletedOn: { isSet: false } }] });
      }
      if (published === true) {
        and.push({ publishedOn: { not: null } });
      } else if (published === false) {
        and.push({ OR: [{ publishedOn: null }, { publishedOn: { isSet: false } }] });
      }
      if (search) {
        and.push({
          OR: [
            { firstName: contains(search) },
            { surname: contains(search) },
            { displayName: contains(search) },
            { slug: contains(search) },
          ],
        });
      }

      const where: Prisma.ArtistWhereInput = and.length > 0 ? { AND: and } : {};

      // The repository owns the include shape (images take 3, labels, urls,
      // releases → release) required by `artistSchema`, which the admin artists
      // query validates against.
      const artists = await ArtistRepository.findMany({ where, skip, take });

      return { success: true, data: artists };
    } catch (error) {
      if (error instanceof Prisma.PrismaClientInitializationError) {
        console.error('Database connection failed:', error);
        return { success: false, error: 'Database unavailable' };
      }

      console.error('Unexpected error:', error);
      return { success: false, error: 'Failed to retrieve artists' };
    }
  }

  /**
   * Update an artist by ID
   */
  static async updateArtist(
    id: string,
    data: Prisma.ArtistUpdateInput
  ): Promise<ServiceResponse<Artist>> {
    try {
      const artist = (await ArtistRepository.update(
        id,
        sanitizeBioWriteFields(data)
      )) as unknown as Artist;

      return { success: true, data: artist };
    } catch (error) {
      // Record not found
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
        return { success: false, error: 'Artist not found' };
      }

      // Unique constraint violations
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        return { success: false, error: 'Artist with this slug already exists' };
      }

      if (error instanceof Prisma.PrismaClientInitializationError) {
        console.error('Database connection failed:', error);
        return { success: false, error: 'Database unavailable' };
      }

      console.error('Unexpected error:', error);
      return { success: false, error: 'Failed to update artist' };
    }
  }

  /**
   * Delete an artist by ID (hard delete)
   */
  static async deleteArtist(id: string): Promise<ServiceResponse<Artist>> {
    try {
      const artist = (await ArtistRepository.delete(id)) as unknown as Artist;

      return { success: true, data: artist };
    } catch (error) {
      // Record not found
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
        return { success: false, error: 'Artist not found' };
      }

      if (error instanceof Prisma.PrismaClientInitializationError) {
        console.error('Database connection failed:', error);
        return { success: false, error: 'Database unavailable' };
      }

      console.error('Unexpected error:', error);
      return { success: false, error: 'Failed to delete artist' };
    }
  }

  /**
   * Soft delete an artist (archive)
   */
  static async archiveArtist(id: string): Promise<ServiceResponse<Artist>> {
    try {
      const artist = (await ArtistRepository.archive(id)) as unknown as Artist;

      return { success: true, data: artist };
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
        return { success: false, error: 'Artist not found' };
      }

      if (error instanceof Prisma.PrismaClientInitializationError) {
        console.error('Database connection failed:', error);
        return { success: false, error: 'Database unavailable' };
      }

      console.error('Unexpected error:', error);
      return { success: false, error: 'Failed to archive artist' };
    }
  }

  /**
   * Publish an artist by stamping `publishedOn` with the current time.
   */
  static async publishArtist(id: string): Promise<ServiceResponse<Artist>> {
    try {
      const artist = (await ArtistRepository.update(id, {
        publishedOn: new Date(),
      })) as unknown as Artist;

      return { success: true, data: artist };
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
        return { success: false, error: 'Artist not found' };
      }

      if (error instanceof Prisma.PrismaClientInitializationError) {
        console.error('Database connection failed:', error);
        return { success: false, error: 'Database unavailable' };
      }

      console.error('Unexpected error:', error);
      return { success: false, error: 'Failed to publish artist' };
    }
  }

  /**
   * Restore a soft-deleted (archived) artist by clearing `deletedOn`.
   */
  static async restoreArtist(id: string): Promise<ServiceResponse<Artist>> {
    try {
      const artist = (await ArtistRepository.update(id, {
        deletedOn: null,
      })) as unknown as Artist;

      return { success: true, data: artist };
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
        return { success: false, error: 'Artist not found' };
      }

      if (error instanceof Prisma.PrismaClientInitializationError) {
        console.error('Database connection failed:', error);
        return { success: false, error: 'Database unavailable' };
      }

      console.error('Unexpected error:', error);
      return { success: false, error: 'Failed to restore artist' };
    }
  }

  /**
   * Upload a single image to S3 and create the Image record in the database
   */
  static async uploadArtistImage(
    artistId: string,
    imageData: ImageUploadInput
  ): Promise<ServiceResponse<ImageUploadResult>> {
    try {
      // Verify artist exists
      const artistExists = await ArtistRepository.existsById(artistId);

      if (!artistExists) {
        return { success: false, error: 'Artist not found' };
      }

      const s3Bucket = process.env.S3_BUCKET;
      const cdnDomainRaw = process.env.CDN_DOMAIN;
      // Strip any existing protocol from CDN domain to avoid double https://
      const cdnDomain = cdnDomainRaw?.replace(/^https?:\/\//, '');

      if (!s3Bucket) {
        return { success: false, error: 'S3 bucket not configured' };
      }

      const s3Client = getS3Client();

      // Generate unique S3 key
      const s3Key = generateS3Key(artistId, imageData.fileName);

      // Use provided content type or fallback to application/octet-stream
      const contentType = imageData.contentType || 'application/octet-stream';

      // Upload to S3
      const putCommand = new PutObjectCommand({
        Bucket: s3Bucket,
        Key: s3Key,
        Body: imageData.file,
        ContentType: contentType,
        CacheControl: 'public, max-age=31536000, immutable',
        Metadata: {
          artistId,
          originalFileName: imageData.fileName,
          uploadedAt: new Date().toISOString(),
        },
      });

      await s3Client.send(putCommand);

      // Construct the CDN URL
      const awsRegion = process.env.AWS_REGION || 'us-east-1';
      const s3DirectUrl = `https://${s3Bucket}.s3.${awsRegion}.amazonaws.com/${s3Key}`;
      const imageUrl = cdnDomain ? `https://${cdnDomain}/${s3Key}` : s3DirectUrl;

      // Get the next sort order for this artist
      const existingImages = await ImageRepository.findManyByOwner({ artistId }, { id: true });
      const nextSortOrder = existingImages.length;

      // Create Image record in database with sortOrder
      const image = await ImageRepository.create({
        src: imageUrl,
        caption: imageData.caption,
        altText: imageData.altText,
        artistId,
        sortOrder: nextSortOrder,
      });

      return {
        success: true,
        data: {
          id: image.id,
          src: image.src || imageUrl,
          caption: image.caption || undefined,
          altText: image.altText || undefined,
          sortOrder: (image as { sortOrder?: number }).sortOrder ?? nextSortOrder,
        },
      };
    } catch (error) {
      if (error instanceof Prisma.PrismaClientInitializationError) {
        console.error('Database connection failed:', error);
        return { success: false, error: 'Database unavailable' };
      }

      console.error('Image upload error:', error);
      return { success: false, error: 'Failed to upload image' };
    }
  }

  /**
   * Upload multiple images for an artist
   */
  static async uploadArtistImages(
    artistId: string,
    images: ImageUploadInput[]
  ): Promise<ServiceResponse<ImageUploadResult[]>> {
    try {
      // Verify artist exists
      const artistExists = await ArtistRepository.existsById(artistId);

      if (!artistExists) {
        return { success: false, error: 'Artist not found' };
      }

      const results: ImageUploadResult[] = [];
      const errors: string[] = [];

      // Upload images sequentially to avoid overwhelming S3
      for (const imageData of images) {
        const result = await this.uploadArtistImage(artistId, imageData);
        if (result.success) {
          results.push(result.data);
        } else {
          errors.push(`${imageData.fileName}: ${result.error}`);
        }
      }

      if (results.length === 0 && errors.length > 0) {
        return { success: false, error: errors.join('; ') };
      }

      return { success: true, data: results };
    } catch (error) {
      console.error('Multiple image upload error:', error);
      return { success: false, error: 'Failed to upload images' };
    }
  }

  /**
   * Delete an artist image from S3 and the database
   */
  static async deleteArtistImage(imageId: string): Promise<ServiceResponse<{ id: string }>> {
    try {
      // Get the image record to get the S3 key
      const image = await ImageRepository.findUniqueById(imageId, {
        id: true,
        src: true,
        artistId: true,
      });

      if (!image) {
        return { success: false, error: 'Image not found' };
      }

      // Extract S3 key from URL
      const s3Bucket = process.env.S3_BUCKET;
      const cdnDomainRaw = process.env.CDN_DOMAIN;
      // Strip any existing protocol from CDN domain
      const cdnDomain = cdnDomainRaw?.replace(/^https?:\/\//, '');

      if (image.src && s3Bucket) {
        let s3Key: string | null = null;

        if (cdnDomain && image.src.includes(cdnDomain)) {
          // Extract key from CDN URL (handles both correct and malformed URLs with double https://)
          s3Key = image.src.replace(/^(?:https:\/\/|http:\/\/)+/, '').replace(`${cdnDomain}/`, '');
        } else if (image.src.includes('.s3.')) {
          // Extract key from S3 URL
          const urlParts = image.src.split('.s3.');
          if (urlParts[1]) {
            const keyPart = urlParts[1].split('/').slice(1).join('/');
            s3Key = keyPart;
          }
        }

        // Delete from S3 if we have the key
        if (s3Key) {
          try {
            const s3Client = getS3Client();
            const deleteCommand = new DeleteObjectCommand({
              Bucket: s3Bucket,
              Key: s3Key,
            });
            await s3Client.send(deleteCommand);
          } catch (s3Error) {
            console.error('S3 delete error (continuing with DB delete):', s3Error);
            // Continue with database deletion even if S3 fails
          }
        }
      }

      // Delete from database
      await ImageRepository.delete(imageId);

      return { success: true, data: { id: imageId } };
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
        return { success: false, error: 'Image not found' };
      }

      if (error instanceof Prisma.PrismaClientInitializationError) {
        console.error('Database connection failed:', error);
        return { success: false, error: 'Database unavailable' };
      }

      console.error('Image deletion error:', error);
      return { success: false, error: 'Failed to delete image' };
    }
  }

  /**
   * Get all images for an artist
   */
  static async getArtistImages(artistId: string): Promise<ServiceResponse<ImageUploadResult[]>> {
    try {
      const images = await ImageRepository.findManyByArtist(artistId);

      return {
        success: true,
        data: images.map((img) => ({
          id: img.id,
          src: img.src || '',
          caption: img.caption || undefined,
          altText: img.altText || undefined,
          sortOrder: (img as { sortOrder?: number }).sortOrder ?? 0,
        })),
      };
    } catch (error) {
      if (error instanceof Prisma.PrismaClientInitializationError) {
        console.error('Database connection failed:', error);
        return { success: false, error: 'Database unavailable' };
      }

      console.error('Get artist images error:', error);
      return { success: false, error: 'Failed to retrieve artist images' };
    }
  }

  /**
   * Update image metadata (caption, altText)
   */
  static async updateArtistImage(
    imageId: string,
    data: { caption?: string; altText?: string }
  ): Promise<ServiceResponse<ImageUploadResult>> {
    try {
      const image = await ImageRepository.update(imageId, {
        caption: data.caption,
        altText: data.altText,
      });

      return {
        success: true,
        data: {
          id: image.id,
          src: image.src || '',
          caption: image.caption || undefined,
          altText: image.altText || undefined,
          sortOrder: (image as { sortOrder?: number }).sortOrder ?? 0,
        },
      };
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
        return { success: false, error: 'Image not found' };
      }

      if (error instanceof Prisma.PrismaClientInitializationError) {
        console.error('Database connection failed:', error);
        return { success: false, error: 'Database unavailable' };
      }

      console.error('Update image error:', error);
      return { success: false, error: 'Failed to update image' };
    }
  }

  /**
   * Reorder images for an artist
   * @param imageIds - Array of image IDs in the desired order
   */
  static async reorderArtistImages(
    artistId: string,
    imageIds: string[]
  ): Promise<ServiceResponse<ImageUploadResult[]>> {
    try {
      // Verify all images belong to the artist
      const existingImages = await ImageRepository.findManyByArtistAndIds(artistId, imageIds);

      if (existingImages.length !== imageIds.length) {
        return { success: false, error: 'Some images not found or do not belong to this artist' };
      }

      // Update sort order for each image
      const updatePromises = imageIds.map((id, index) =>
        ImageRepository.updateSortOrder(id, index)
      );

      await Promise.all(updatePromises);

      // Fetch updated images in new order
      const updatedImages = await ImageRepository.findManyByArtist(artistId);

      return {
        success: true,
        data: updatedImages.map((img) => ({
          id: img.id,
          src: img.src || '',
          caption: img.caption || undefined,
          altText: img.altText || undefined,
          sortOrder: (img as { sortOrder?: number }).sortOrder ?? 0,
        })),
      };
    } catch (error) {
      if (error instanceof Prisma.PrismaClientInitializationError) {
        console.error('Database connection failed:', error);
        return { success: false, error: 'Database unavailable' };
      }

      console.error('Reorder images error:', error);
      return { success: false, error: 'Failed to reorder images' };
    }
  }

  /**
   * Search published (active, non-deleted) artists.
   * Used by the public artist search feature.
   */
  static async searchPublishedArtists(params?: {
    skip?: number;
    take?: number;
    search?: string;
  }): Promise<ServiceResponse<Artist[]>> {
    try {
      const { skip = 0, take = 50, search } = params || {};

      const where: Prisma.ArtistWhereInput = {
        isActive: true,
        // Prisma 6 + MongoDB: `deletedOn: null` only matches fields explicitly
        // set to null, not missing fields. Use OR to handle both cases.
        OR: [{ deletedOn: null }, { deletedOn: { isSet: false } }],
        // Only return artists that have at least one published, non-deleted release
        releases: {
          some: {
            release: {
              publishedAt: { not: null },
              OR: [{ deletedOn: null }, { deletedOn: { isSet: false } }],
            },
          },
        },
        ...(search && {
          AND: [
            {
              OR: [
                { firstName: { contains: search, mode: 'insensitive' as const } },
                { surname: { contains: search, mode: 'insensitive' as const } },
                { displayName: { contains: search, mode: 'insensitive' as const } },
                { slug: { contains: search, mode: 'insensitive' as const } },
                {
                  releases: {
                    some: {
                      release: {
                        title: { contains: search, mode: 'insensitive' as const },
                        publishedAt: { isSet: true },
                        OR: [{ deletedOn: null }, { deletedOn: { isSet: false } }],
                      },
                    },
                  },
                },
              ],
            },
          ],
        }),
      };

      // The repository owns the orderBy + lightweight images/releases include
      // the public search UI consumes.
      const artists = await ArtistRepository.searchPublished({ where, skip, take });

      return { success: true, data: artists };
    } catch (error) {
      if (error instanceof Prisma.PrismaClientInitializationError) {
        console.error('Database connection failed:', error);
        return { success: false, error: 'Database unavailable' };
      }

      console.error('Unexpected error:', error);
      return { success: false, error: 'Failed to search artists' };
    }
  }

  /**
   * Get an artist by slug with full release and digital format data.
   * Post-query filters to only published, non-deleted releases.
   */
  /**
   * List published artists for the public `/artists` index, with their primary
   * bio images and short bios sanitized for redisplay.
   */
  static async listPublishedArtists(): Promise<ServiceResponse<ArtistListWithBio[]>> {
    try {
      const artists = await ArtistRepository.listPublishedWithBio({ skip: 0, take: 100 });
      const sanitized = artists.map((artist) => ({
        ...artist,
        shortBio: artist.shortBio ? sanitizeBioText(artist.shortBio) : artist.shortBio,
      }));
      return { success: true, data: sanitized };
    } catch (error) {
      if (error instanceof Prisma.PrismaClientInitializationError) {
        console.error('Database connection failed:', error);
        return { success: false, error: 'Database unavailable' };
      }
      console.error('Unexpected error:', error);
      return { success: false, error: 'Failed to retrieve artists' };
    }
  }

  static async getArtistBySlugWithReleases(
    slug: string
  ): Promise<ServiceResponse<ArtistWithPublishedReleases>> {
    try {
      const artist = await ArtistRepository.findBySlugWithReleases({
        slug,
        isActive: true,
        // Prisma 6 + MongoDB: `deletedOn: null` only matches fields explicitly
        // set to null, not missing fields. Use OR to handle both cases.
        OR: [{ deletedOn: null }, { deletedOn: { isSet: false } }],
      });

      if (!artist) {
        return { success: false, error: 'Artist not found' };
      }

      // Filter to only published, non-deleted releases (Prisma MongoDB
      // doesn't support nested where on junction table includes). Bio prose is
      // sanitized on read so redisplay is safe regardless of how it was
      // authored (AI-generated bios are also sanitized at write time).
      const filteredArtist: ArtistWithPublishedReleases = {
        ...artist,
        bio: artist.bio ? sanitizeBioHtml(artist.bio) : artist.bio,
        // Short bio is rich-text too (Tiptap); kept as sanitized HTML for
        // BioHtml on the detail/bio pages. Plain-text surfaces (metadata
        // descriptions, listing cards) strip it with sanitizeBioText instead.
        shortBio: artist.shortBio ? sanitizeBioHtml(artist.shortBio) : artist.shortBio,
        releases: artist.releases.filter(
          (ar) => ar.release.publishedAt != null && ar.release.deletedOn == null
        ),
      };

      return { success: true, data: filteredArtist };
    } catch (error) {
      if (error instanceof Prisma.PrismaClientInitializationError) {
        console.error('Database connection failed:', error);
        return { success: false, error: 'Database unavailable' };
      }

      console.error('Unexpected error:', error);
      return { success: false, error: 'Failed to retrieve artist' };
    }
  }

  /**
   * Find an existing artist by name or create a new one.
   *
   * Search order:
   *   1. Slug match (deterministic, unique)
   *   2. Case-insensitive displayName match
   *   3. Case-insensitive firstName + surname match
   *   4. Create new artist if no match found
   *
   * @param artistName - Full artist name from ID3 metadata (e.g., "Ceschi", "John Doe")
   * @returns The artist ID and display name
   */
  static async findOrCreateByName(
    artistName: string
  ): Promise<
    ServiceResponse<{ id: string; displayName: string | null; firstName: string; surname: string }>
  > {
    const trimmed = artistName.trim();
    if (!trimmed) {
      return { success: false, error: 'Artist name is empty' };
    }

    try {
      const slug = generateSlug(trimmed);
      const { firstName, lastName } = splitFullName(trimmed);
      const selectFields = {
        id: true,
        displayName: true,
        firstName: true,
        surname: true,
      } as const;

      // 1. Try slug match (unique index, most reliable)
      if (slug) {
        const bySlug = await ArtistRepository.findUniqueBySlug(slug, selectFields);
        if (bySlug) {
          return { success: true, data: bySlug };
        }
      }

      // 2. Try case-insensitive displayName match
      const byDisplayName = await ArtistRepository.findFirstByDisplayName(trimmed, selectFields);
      if (byDisplayName) {
        return { success: true, data: byDisplayName };
      }

      // 3. Try case-insensitive firstName + surname match
      if (firstName) {
        const byName = await ArtistRepository.findFirstByName(firstName, lastName, selectFields);
        if (byName) {
          return { success: true, data: byName };
        }
      }

      // 4. Create new artist
      const newArtist = await ArtistRepository.createWithSelect(
        {
          firstName,
          surname: lastName,
          displayName: trimmed,
          slug: slug || generateSlug(firstName || 'artist'),
          isActive: true,
        },
        selectFields
      );
      return { success: true, data: newArtist };
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        // Slug collision — try to find the existing artist instead
        const slug = generateSlug(trimmed);
        const existing = await ArtistRepository.findUniqueBySlug(slug, {
          id: true,
          displayName: true,
          firstName: true,
          surname: true,
        });
        if (existing) {
          return { success: true, data: existing };
        }
        return { success: false, error: 'Artist with this slug already exists' };
      }

      if (error instanceof Prisma.PrismaClientInitializationError) {
        console.error('Database connection failed:', error);
        return { success: false, error: 'Database unavailable' };
      }

      console.error('Unexpected error in findOrCreateByName:', error);
      return { success: false, error: 'Failed to find or create artist' };
    }
  }

  /**
   * Idempotently connect an artist to a release via the ArtistRelease join table.
   * Uses upsert to avoid duplicate constraint violations.
   *
   * @param artistId - The Artist ID
   * @param releaseId - The Release ID
   */
  static async connectToRelease(artistId: string, releaseId: string): Promise<void> {
    await ArtistRepository.connectToRelease(artistId, releaseId);
  }

  /**
   * Lightweight existence check used by callers that only need to validate an
   * artistId before performing a follow-up write.
   */
  static async existsById(artistId: string): Promise<boolean> {
    const found = await ArtistRepository.existsById(artistId);
    return Boolean(found);
  }
}
