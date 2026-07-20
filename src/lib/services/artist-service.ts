/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import 'server-only';

import { PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';

import {
  ArtistRepository,
  type BioImageRehostRow,
  type EnrichedArtistFieldUpdate,
} from '@/lib/repositories/artist-repository';
import { ImageRepository } from '@/lib/repositories/image-repository';
import type {
  Artist,
  ArtistBioImageRecord,
  ArtistBioLinkRecord,
  ArtistListFilters,
  ArtistListWithBio,
  ArtistNameRecord,
  ArtistWithPublishedReleases,
  CreateArtistBioImageData,
  CreateArtistBioLinkData,
  CreateArtistData,
  UpdateArtistData,
} from '@/lib/types/domain/artist';
import { DataError } from '@/lib/types/domain/errors';
import type { ImageRecord } from '@/lib/types/domain/image';
import { buildCdnUrl } from '@/lib/utils/cdn-url';
import { generateSlug } from '@/lib/utils/generate-slug';
import { isPubliclyRoutableUrl } from '@/lib/utils/ip-guard';
import { loggers } from '@/lib/utils/logger';
import { deleteS3Object, getS3Client } from '@/lib/utils/s3-client';
import { extractS3KeyFromUrl } from '@/lib/utils/s3-key-utils';
import {
  sanitizeBioHtml,
  sanitizeBioHtmlNoImages,
  sanitizeBioText,
} from '@/lib/utils/sanitize-bio-html';
import { splitFullName } from '@/lib/utils/split-full-name';
import type { VideoArtistDetail } from '@/lib/validation/video-artist-detail-schema';

import { failFromError } from './_internal/map-data-error';
import { BioImageService } from './bio-image-service';

import type { ServiceResponse } from './service.types';

const logger = loggers.media;

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
 * Map a persisted image row to the public {@link ImageUploadResult} shape,
 * applying the same `src`/`sortOrder` fallbacks the service has always used.
 */
const toImageUploadResult = (
  image: ImageRecord,
  fallbacks?: { src?: string; sortOrder?: number }
): ImageUploadResult => ({
  id: image.id,
  src: image.src || (fallbacks?.src ?? ''),
  caption: image.caption || undefined,
  altText: image.altText || undefined,
  sortOrder: image.sortOrder ?? fallbacks?.sortOrder ?? 0,
});

/**
 * Upload an image buffer to S3 under `s3Key` and return the public URL for it
 * (CDN domain when configured, otherwise the direct S3 URL). The artist id and
 * original file name are stamped into the object metadata.
 */
const uploadImageToS3 = async (
  s3Bucket: string,
  s3Key: string,
  artistId: string,
  imageData: ImageUploadInput
): Promise<string> => {
  const s3Client = getS3Client();

  // Use provided content type or fallback to application/octet-stream
  const contentType = imageData.contentType || 'application/octet-stream';

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

  // Construct the CDN URL (strip any protocol already on CDN_DOMAIN).
  const cdnDomain = process.env.CDN_DOMAIN?.replace(/^https?:\/\//, '');
  const awsRegion = process.env.AWS_REGION || 'us-east-1';
  const s3DirectUrl = `https://${s3Bucket}.s3.${awsRegion}.amazonaws.com/${s3Key}`;
  return cdnDomain ? `https://${cdnDomain}/${s3Key}` : s3DirectUrl;
};

/**
 * Best-effort delete of a single S3 object for an artist image. Logs and
 * swallows any S3 failure so the caller can continue with the DB delete — the
 * orphaned object is reclaimed by lifecycle rules.
 */
const deleteImageFromS3 = async (s3Bucket: string, s3Key: string): Promise<void> => {
  try {
    const s3Client = getS3Client();
    const deleteCommand = new DeleteObjectCommand({
      Bucket: s3Bucket,
      Key: s3Key,
    });
    await s3Client.send(deleteCommand);
  } catch (s3Error) {
    logger.error('S3 delete error (continuing with DB delete)', s3Error);
    // Continue with database deletion even if S3 fails
  }
};

/**
 * Sanitizes the rich-text bio fields (`bio`, `shortBio`, `altBio`) before they
 * are persisted. All three are authored in the Tiptap editor, so they are HTML;
 * `sanitizeBioHtml` enforces the allowlist (and link hardening) on write so
 * every read surface can trust the stored markup. Only string values are
 * touched, leaving `null`/`undefined` intact.
 */
const sanitizeBioWriteFields = <T extends CreateArtistData | UpdateArtistData>(data: T): T => {
  const sanitized = { ...data };
  if (typeof sanitized.bio === 'string') sanitized.bio = sanitizeBioHtml(sanitized.bio);
  // The short bio is a one-paragraph teaser; strip <img> at write time so a
  // manually pasted image in the admin editor cannot persist in the field.
  if (typeof sanitized.shortBio === 'string')
    sanitized.shortBio = sanitizeBioHtmlNoImages(sanitized.shortBio);
  if (typeof sanitized.altBio === 'string') sanitized.altBio = sanitizeBioHtml(sanitized.altBio);
  return sanitized;
};

/** Matches every `<img src="…">` in a bio HTML string (capture group 1 = src). */
const IMG_SRC_PATTERN = /<img\s[^>]*src="([^"]+)"/g;

/** Path marker identifying generation-time single-variant thumbnails. */
const BIO_THUMBS_MARKER = '/bio/thumbs/';

/** Collects every `<img>` src from a bio HTML field (empty for null/undefined). */
const collectImgSrcs = (html: string | null | undefined): string[] =>
  [...(html ?? '').matchAll(IMG_SRC_PATTERN)].map((match) => match[1]);

/** A src needs the full re-host when it is a generation-time thumbnail or an
 *  external (non-CDN) URL pasted into the editor. */
const needsFullRehost = (src: string, cdnPrefix: string): boolean =>
  src.includes(BIO_THUMBS_MARKER) || !src.startsWith(cdnPrefix);

/** One planned re-host: the embedded src, the URL to fetch from, and the bio
 *  image row to upgrade when the src came from a generated thumbnail. */
interface RehostPlan {
  src: string;
  source: string;
  rowId: string | null;
}

/** Plans a single re-host. A src matching a bio image row re-hosts from the
 *  row's recorded `originalUrl` (null plan when no original was recorded); an
 *  unmatched src is a manual paste and re-hosts from itself. */
const planRehost = (src: string, rows: BioImageRehostRow[]): RehostPlan | null => {
  const row = rows.find((candidate) => candidate.thumbnailUrl === src || candidate.url === src);
  if (row) return row.originalUrl ? { src, source: row.originalUrl, rowId: row.id } : null;
  return { src, source: src, rowId: null };
};

/** Replaces every occurrence of `src` in the bio HTML fields with `nextUrl`. */
const withReplacedSrc = (
  result: UpdateArtistData,
  src: string,
  nextUrl: string
): UpdateArtistData => ({
  ...result,
  ...(typeof result.bio === 'string' ? { bio: result.bio.replaceAll(src, nextUrl) } : {}),
  ...(typeof result.altBio === 'string' ? { altBio: result.altBio.replaceAll(src, nextUrl) } : {}),
});

/** Inputs for a single save-time re-host pass over one embedded src. */
interface RehostOneContext {
  artistId: string;
  src: string;
  index: number;
  rows: BioImageRehostRow[];
}

/** Executes one re-host plan: SSRF-guards the fetch source, re-hosts to full
 *  variants, rewrites the src in both HTML fields, and upgrades the matching
 *  bio image row. Any refusal or failure logs and returns `result` unchanged. */
const rehostOne = async (
  result: UpdateArtistData,
  { artistId, src, index, rows }: RehostOneContext
): Promise<UpdateArtistData> => {
  const plan = planRehost(src, rows);
  if (!plan) {
    logger.warn('bio_image_rehost_missing_original', { artistId, src });
    return result;
  }
  if (!(await isPubliclyRoutableUrl(plan.source))) {
    logger.warn('bio_image_rehost_blocked_private', { artistId, source: plan.source });
    return result;
  }
  try {
    const rehosted = await BioImageService.rehostWithVariants(plan.source, artistId, index);
    if (plan.rowId) {
      await ArtistRepository.updateBioImageUrl(plan.rowId, rehosted.url);
    }
    return withReplacedSrc(result, src, rehosted.url);
  } catch (error) {
    logger.warn('bio_image_rehost_failed', { artistId, src, error: String(error) });
    return result;
  }
};

/**
 * Upgrades embedded bio images to fully re-hosted CDN variants at save time:
 * generation-time thumbnails re-host from their recorded originalUrl; manually
 * pasted external URLs re-host directly (SSRF-guarded). Every failure is
 * logged and non-blocking — the save proceeds with the prior src and the next
 * save retries. Create-mode is exempt (no artistId/bio rows yet); pasted
 * images finalize on the first update. SSRF defense: the early
 * `isPubliclyRoutableUrl` check in `rehostOne` refuses private sources with a
 * specific log line, and the shared fetch helper (`fetchImageBuffer`) re-vets
 * the first hop and refuses redirects (`redirect: 'error'`) for every re-host
 * path. Both vets resolve DNS separately from the fetch (vet-then-fetch), so
 * a DNS-rebinding / dual-stack window remains — an accepted residual risk for
 * this admin-only save path.
 */
const finalizeBioImages = async (
  artistId: string,
  data: UpdateArtistData
): Promise<UpdateArtistData> => {
  if (data.bio === undefined && data.altBio === undefined) return data;
  // Accumulate outside the try so a mid-loop throw never discards replacements
  // already applied: each rehostOne persists its row url and rewrites the html
  // together, and returning the accumulated result keeps them consistent even
  // when a later iteration aborts the loop.
  let result = { ...data };
  try {
    const rows = await ArtistRepository.findBioImagesForRehost(artistId);
    const cdnPrefix = buildCdnUrl('');
    const srcs = [...new Set([...collectImgSrcs(data.bio), ...collectImgSrcs(data.altBio)])].filter(
      (src) => needsFullRehost(src, cdnPrefix)
    );
    for (const [index, src] of srcs.entries()) {
      result = await rehostOne(result, { artistId, src, index, rows });
    }
  } catch (error) {
    logger.warn('bio_image_finalize_failed', { artistId, error: String(error) });
  }
  return result;
};

/** Path marker for generation-time bio media on the CDN — the only keys the
 *  palette delete is allowed to clean up. */
const BIO_MEDIA_PATH_MARKER = '/bio/';

/** Best-effort cleanup of a single CDN bio thumbnail. Only acts on URLs that
 *  contain the bio media path marker; all others are silently skipped.
 *  `deleteS3Object` never throws (returns `false` on error), so this is
 *  inherently best-effort. */
const cleanupBioMediaObject = async (url: string | null): Promise<void> => {
  if (!url || !url.includes(BIO_MEDIA_PATH_MARKER)) return;
  const s3Key = extractS3KeyFromUrl(url);
  if (s3Key) await deleteS3Object(s3Key);
};

/** Pre-computed lookup keys for the find-or-create-by-name search order. */
interface ArtistNameLookup {
  trimmed: string;
  slug: string;
  firstName: string;
  lastName: string;
}

/**
 * Run the find-or-create-by-name search order and return the first matching
 * artist, or `null` when none match:
 *   1. Slug match (unique index, most reliable)
 *   2. Case-insensitive displayName match
 *   3. Case-insensitive firstName + surname match
 */
const findArtistByName = async (lookup: ArtistNameLookup): Promise<ArtistNameRecord | null> => {
  const { trimmed, slug, firstName, lastName } = lookup;

  if (slug) {
    const bySlug = await ArtistRepository.findUniqueBySlug(slug);
    if (bySlug) {
      return bySlug;
    }
  }

  const byDisplayName = await ArtistRepository.findFirstByDisplayName(trimmed);
  if (byDisplayName) {
    return byDisplayName;
  }

  if (firstName) {
    const byName = await ArtistRepository.findFirstByName(firstName, lastName);
    if (byName) {
      return byName;
    }
  }

  return null;
};

/**
 * Recover from a slug-collision (`DUPLICATE`) raised while creating an artist by
 * re-reading the artist that now owns the slug. Returns a failure when the row
 * still cannot be found.
 */
const recoverArtistFromDuplicate = async (
  trimmed: string
): Promise<ServiceResponse<ArtistNameRecord>> => {
  const slug = generateSlug(trimmed);
  const existing = await ArtistRepository.findUniqueBySlug(slug);
  if (existing) {
    return { success: true, data: existing };
  }
  return { success: false, error: 'Artist with this slug already exists', code: 'DUPLICATE' };
};

/** The artist fields a video-enrichment suggestion may apply. */
export type ArtistEnrichedField =
  | 'firstName'
  | 'middleName'
  | 'surname'
  | 'akaNames'
  | 'displayName'
  | 'bornOn';

/**
 * Explicit whitelist switch mapping a suggestion field onto a typed one-field
 * update — never a dynamic key. `bornOn` values arrive as YYYY-MM-DD and
 * parse as UTC midnight.
 */
const buildEnrichedFieldUpdate = (
  field: ArtistEnrichedField,
  value: string
): EnrichedArtistFieldUpdate => {
  switch (field) {
    case 'firstName':
      return { firstName: value };
    case 'middleName':
      return { middleName: value };
    case 'surname':
      return { surname: value };
    case 'akaNames':
      return { akaNames: value };
    case 'displayName':
      return { displayName: value };
    case 'bornOn':
      return { bornOn: new Date(value) };
  }
};

/** Trim an optional string field; returns `undefined` when absent or blank. */
const trimDetail = (value: string | undefined): string | undefined => {
  const t = value?.trim();
  return t || undefined;
};

/** Input for {@link buildArtistCreateData}. */
interface ArtistCreateInput {
  firstName: string;
  lastName: string;
  trimmed: string;
  slug: string;
  details?: VideoArtistDetail;
}

/** Optional middleName spread: only include the field when a non-blank value is present. */
const middleNameSpread = (value: string | undefined): { middleName?: string } =>
  value ? { middleName: value } : {};

/**
 * Build the `createWithSelect` payload for a new artist shell, merging
 * optional admin-reviewed detail values (per-field, trimmed-non-empty guards)
 * with the naive `splitFullName` fallbacks and the source-name display name.
 * `middleName` is omitted entirely when empty so absent stays absent.
 */
const buildArtistCreateData = ({
  firstName,
  lastName,
  trimmed,
  slug,
  details,
}: ArtistCreateInput): CreateArtistData => ({
  firstName: trimDetail(details?.firstName) || firstName,
  surname: trimDetail(details?.surname) || lastName,
  displayName: trimDetail(details?.displayName) || trimmed,
  slug: slug || generateSlug(firstName || 'artist'),
  isActive: true,
  ...middleNameSpread(trimDetail(details?.middleName)),
});

export class ArtistService {
  /**
   * Create a new artist
   */
  static async createArtist(data: CreateArtistData): Promise<ServiceResponse<Artist>> {
    try {
      // Bio-image finalization (finalizeBioImages) is intentionally skipped on
      // create: a new artist has no generated bio rows, and a manually pasted
      // external image finalizes on the first update.
      const artist = await ArtistRepository.create(sanitizeBioWriteFields(data));
      return { success: true, data: artist };
    } catch (error) {
      return failFromError(error, {
        DUPLICATE: 'Artist with this slug already exists',
        UNKNOWN: 'Failed to create artist',
      });
    }
  }

  /**
   * Get an artist by ID
   */
  static async getArtistById(id: string): Promise<ServiceResponse<Artist>> {
    try {
      const artist = await ArtistRepository.findById(id);

      if (!artist) {
        return { success: false, error: 'Artist not found', code: 'NOT_FOUND' };
      }

      return { success: true, data: artist };
    } catch (error) {
      return failFromError(error, { UNKNOWN: 'Failed to retrieve artist' });
    }
  }

  /**
   * Get an artist by slug
   */
  static async getArtistBySlug(slug: string): Promise<ServiceResponse<Artist>> {
    try {
      const artist = await ArtistRepository.findBySlug(slug);

      if (!artist) {
        return { success: false, error: 'Artist not found', code: 'NOT_FOUND' };
      }

      return { success: true, data: artist as unknown as Artist };
    } catch (error) {
      return failFromError(error, { UNKNOWN: 'Failed to retrieve artist' });
    }
  }

  /**
   * Get all artists with optional filters.
   *
   * Supports server-side `search` plus `published`/`deleted` filtering for the
   * admin listing. The repository owns the Mongo-safe `where` construction and
   * the include shape (`artistSchema`-compatible).
   *
   * - `published === true` → only artists with a `publishedOn` date.
   * - `published === false` → only artists without a `publishedOn` date.
   * - `published == null` → no publish filter.
   * - `deleted` falsy → exclude soft-deleted artists; `deleted === true` → include them.
   */
  static async getArtists(params?: ArtistListFilters): Promise<ServiceResponse<Artist[]>> {
    try {
      const artists = await ArtistRepository.findMany(params ?? {});
      return { success: true, data: artists };
    } catch (error) {
      return failFromError(error, { UNKNOWN: 'Failed to retrieve artists' });
    }
  }

  /**
   * Update an artist by ID
   */
  static async updateArtist(id: string, data: UpdateArtistData): Promise<ServiceResponse<Artist>> {
    try {
      const sanitized = sanitizeBioWriteFields(data);
      const finalized = await finalizeBioImages(id, sanitized);
      const artist = await ArtistRepository.update(id, finalized);
      return { success: true, data: artist };
    } catch (error) {
      return failFromError(error, {
        NOT_FOUND: 'Artist not found',
        DUPLICATE: 'Artist with this slug already exists',
        UNKNOWN: 'Failed to update artist',
      });
    }
  }

  /**
   * Delete an artist by ID (hard delete)
   */
  static async deleteArtist(id: string): Promise<ServiceResponse<Artist>> {
    try {
      const artist = await ArtistRepository.delete(id);
      return { success: true, data: artist as unknown as Artist };
    } catch (error) {
      return failFromError(error, {
        NOT_FOUND: 'Artist not found',
        UNKNOWN: 'Failed to delete artist',
      });
    }
  }

  /**
   * Soft delete an artist (archive)
   */
  static async archiveArtist(id: string): Promise<ServiceResponse<Artist>> {
    try {
      const artist = await ArtistRepository.archive(id);
      return { success: true, data: artist as unknown as Artist };
    } catch (error) {
      return failFromError(error, {
        NOT_FOUND: 'Artist not found',
        UNKNOWN: 'Failed to archive artist',
      });
    }
  }

  /**
   * Publish an artist by stamping `publishedOn` with the current time.
   */
  static async publishArtist(id: string): Promise<ServiceResponse<Artist>> {
    try {
      const artist = await ArtistRepository.update(id, { publishedOn: new Date() });
      return { success: true, data: artist };
    } catch (error) {
      return failFromError(error, {
        NOT_FOUND: 'Artist not found',
        UNKNOWN: 'Failed to publish artist',
      });
    }
  }

  /**
   * Restore a soft-deleted (archived) artist by clearing `deletedOn`.
   */
  static async restoreArtist(id: string): Promise<ServiceResponse<Artist>> {
    try {
      const artist = await ArtistRepository.update(id, { deletedOn: null });
      return { success: true, data: artist };
    } catch (error) {
      return failFromError(error, {
        NOT_FOUND: 'Artist not found',
        UNKNOWN: 'Failed to restore artist',
      });
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
        return { success: false, error: 'Artist not found', code: 'NOT_FOUND' };
      }

      const s3Bucket = process.env.S3_BUCKET;

      if (!s3Bucket) {
        return { success: false, error: 'S3 bucket not configured', code: 'UNKNOWN' };
      }

      // Generate unique S3 key, upload the buffer, and derive its public URL.
      const s3Key = generateS3Key(artistId, imageData.fileName);
      const imageUrl = await uploadImageToS3(s3Bucket, s3Key, artistId, imageData);

      // Get the next sort order for this artist
      const existingImages = await ImageRepository.findManyByOwner({ artistId });
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
        data: toImageUploadResult(image, { src: imageUrl, sortOrder: nextSortOrder }),
      };
    } catch (error) {
      return failFromError(error, { UNKNOWN: 'Failed to upload image' });
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
        return { success: false, error: 'Artist not found', code: 'NOT_FOUND' };
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
        return { success: false, error: errors.join('; '), code: 'UNKNOWN' };
      }

      return { success: true, data: results };
    } catch (error) {
      return failFromError(error, { UNKNOWN: 'Failed to upload images' });
    }
  }

  /**
   * Delete an artist image from S3 and the database
   */
  static async deleteArtistImage(imageId: string): Promise<ServiceResponse<{ id: string }>> {
    try {
      // Get the image record to get the S3 key
      const image = await ImageRepository.findUniqueById(imageId);

      if (!image) {
        return { success: false, error: 'Image not found', code: 'NOT_FOUND' };
      }

      // Extract S3 key from URL (CDN/S3 styles, honouring CDN_DOMAIN).
      const s3Bucket = process.env.S3_BUCKET;

      if (image.src && s3Bucket) {
        const s3Key = extractS3KeyFromUrl(image.src);

        // Delete from S3 if we have the key (best-effort; DB delete always runs).
        if (s3Key) {
          await deleteImageFromS3(s3Bucket, s3Key);
        }
      }

      // Delete from database
      await ImageRepository.delete(imageId);

      return { success: true, data: { id: imageId } };
    } catch (error) {
      return failFromError(error, {
        NOT_FOUND: 'Image not found',
        UNKNOWN: 'Failed to delete image',
      });
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
          sortOrder: img.sortOrder ?? 0,
        })),
      };
    } catch (error) {
      return failFromError(error, { UNKNOWN: 'Failed to retrieve artist images' });
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
          sortOrder: image.sortOrder ?? 0,
        },
      };
    } catch (error) {
      return failFromError(error, {
        NOT_FOUND: 'Image not found',
        UNKNOWN: 'Failed to update image',
      });
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
        return {
          success: false,
          error: 'Some images not found or do not belong to this artist',
          code: 'NOT_FOUND',
        };
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
          sortOrder: img.sortOrder ?? 0,
        })),
      };
    } catch (error) {
      return failFromError(error, { UNKNOWN: 'Failed to reorder images' });
    }
  }

  /**
   * Search published (active, non-deleted) artists.
   * Used by the public artist search feature. The repository owns the Mongo-safe
   * `where` (published + non-deleted + has-published-release) construction.
   */
  static async searchPublishedArtists(
    params?: ArtistListFilters
  ): Promise<ServiceResponse<Artist[]>> {
    try {
      const artists = await ArtistRepository.searchPublished(params ?? {});
      return { success: true, data: artists };
    } catch (error) {
      return failFromError(error, { UNKNOWN: 'Failed to search artists' });
    }
  }

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
      return failFromError(error, { UNKNOWN: 'Failed to retrieve artists' });
    }
  }

  /**
   * Get an artist by slug with full release and digital format data.
   * Post-query filters to only published, non-deleted releases.
   */
  static async getArtistBySlugWithReleases(
    slug: string
  ): Promise<ServiceResponse<ArtistWithPublishedReleases>> {
    try {
      const artist = await ArtistRepository.findPublishedBySlugWithReleases(slug);

      if (!artist) {
        return { success: false, error: 'Artist not found', code: 'NOT_FOUND' };
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
      return failFromError(error, { UNKNOWN: 'Failed to retrieve artist' });
    }
  }

  /**
   * Look up an existing artist by name using the same search order that
   * {@link findOrCreateByName} uses for its match step:
   *   1. Slug match (deterministic, unique)
   *   2. Case-insensitive displayName match
   *   3. Case-insensitive firstName + surname match
   *
   * Returns the matched record (`id`, `displayName`, `firstName`, `surname`) or
   * `null` when none of the three lookups succeeds. This method exists so the
   * admin artist-lookup route and `findOrCreateByName` share the same code path
   * and can never silently drift.
   *
   * @param artistName - Full artist name to look up (trimmed internally)
   */
  static async findByName(artistName: string): Promise<{
    id: string;
    displayName: string | null;
    firstName: string;
    surname: string;
  } | null> {
    const trimmed = artistName.trim();
    if (!trimmed) return null;

    const slug = generateSlug(trimmed);
    const { firstName, lastName } = splitFullName(trimmed);

    return findArtistByName({ trimmed, slug, firstName, lastName });
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
   * When `details` is supplied (admin-reviewed form values), the CREATE branch
   * uses the admin values per field with trimmed-non-empty guards — falling back
   * to the naive split or source name when a field is absent or whitespace-only.
   * The MATCH path ignores `details` entirely: the video form never edits an
   * existing artist. Slug derivation is always based on `artistName` so
   * match/create symmetry is preserved regardless of `details`.
   *
   * @param artistName - Full artist name from ID3 metadata or video form
   * @param details - Optional admin-reviewed name details (ignored on match)
   * @returns The artist ID and display name
   */
  static async findOrCreateByName(
    artistName: string,
    details?: VideoArtistDetail
  ): Promise<
    ServiceResponse<{ id: string; displayName: string | null; firstName: string; surname: string }>
  > {
    const trimmed = artistName.trim();
    if (!trimmed) {
      return { success: false, error: 'Artist name is empty', code: 'INVALID_INPUT' };
    }

    try {
      const slug = generateSlug(trimmed);
      const { firstName, lastName } = splitFullName(trimmed);

      // 1–3. Try slug, then displayName, then firstName + surname matches.
      const found = await findArtistByName({ trimmed, slug, firstName, lastName });
      if (found) {
        return { success: true, data: found };
      }

      // 4. Create new artist — admin detail values override naïve fallbacks per field.
      const createData = buildArtistCreateData({ firstName, lastName, trimmed, slug, details });
      const newArtist = await ArtistRepository.createWithSelect(createData);
      return { success: true, data: newArtist };
    } catch (error) {
      if (error instanceof DataError && error.code === 'DUPLICATE') {
        // Slug collision — try to find the existing artist instead.
        return recoverArtistFromDuplicate(trimmed);
      }

      return failFromError(error, { UNKNOWN: 'Failed to find or create artist' });
    }
  }

  /**
   * Idempotently connect an artist to a release via the ArtistRelease join table.
   *
   * @param artistId - The Artist ID
   * @param releaseId - The Release ID
   */
  static async connectToRelease(artistId: string, releaseId: string): Promise<void> {
    await ArtistRepository.connectToRelease(artistId, releaseId);
  }

  /** Deletes a single discovered bio link row (admin palette X). */
  static async deleteBioLink(linkId: string): Promise<void> {
    await ArtistRepository.deleteBioLink(linkId);
  }

  /** Deletes a single discovered bio image row (admin palette X) and performs
   *  best-effort cleanup of its CDN thumbnail. */
  static async deleteBioImage(imageId: string): Promise<void> {
    const removed = await ArtistRepository.deleteBioImage(imageId);
    await cleanupBioMediaObject(removed.url);
    await cleanupBioMediaObject(removed.thumbnailUrl);
  }

  /** Persists one manually-added bio image and returns the created row. */
  static async createBioImage(input: CreateArtistBioImageData): Promise<ArtistBioImageRecord> {
    return ArtistRepository.createBioImage(input);
  }

  /** Persists one admin-authored bio link and returns the created row.
   *  Dedupes by URL: if the artist already has a link with this URL (custom or
   *  generated), returns that existing row instead of creating a duplicate, so
   *  the reference-links input and the Add-link editor stay idempotent. A
   *  concurrent add can slip between the check and the insert; the DB's
   *  `@@unique([artistId, url])` index then rejects the loser, so a `DUPLICATE`
   *  is recovered by re-reading and returning the row the winner persisted. */
  static async createBioLink(input: CreateArtistBioLinkData): Promise<ArtistBioLinkRecord> {
    const existing = await ArtistRepository.findBioLinkByUrl(input.artistId, input.url);
    if (existing) {
      return existing;
    }
    try {
      return await ArtistRepository.createBioLink(input);
    } catch (error) {
      if (error instanceof DataError && error.code === 'DUPLICATE') {
        const raced = await ArtistRepository.findBioLinkByUrl(input.artistId, input.url);
        if (raced) {
          return raced;
        }
      }
      throw error;
    }
  }

  /** Updates one bio image's attribution text. */
  static async updateBioImageAttribution(
    imageId: string,
    attribution: string | null
  ): Promise<void> {
    await ArtistRepository.updateBioImageAttribution(imageId, attribution);
  }

  /**
   * Lightweight existence check used by callers that only need to validate an
   * artistId before performing a follow-up write.
   */
  static async existsById(artistId: string): Promise<boolean> {
    const found = await ArtistRepository.existsById(artistId);
    return Boolean(found);
  }

  /**
   * Applies one admin-approved enrichment suggestion to the artist record
   * through the field whitelist. Throws on a repository failure — the calling
   * action maps that to a typed error.
   */
  static async applyEnrichedField(
    artistId: string,
    field: ArtistEnrichedField,
    value: string,
    updatedBy: string
  ): Promise<void> {
    await ArtistRepository.updateEnrichedField(
      artistId,
      buildEnrichedFieldUpdate(field, value),
      updatedBy
    );
  }
}
