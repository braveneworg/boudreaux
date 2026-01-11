import 'server-only';

import { PutObjectCommand, S3Client, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { Prisma } from '@prisma/client';

import type { Artist } from '@/lib/types/media-models';

import { prisma } from '../prisma';

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
 * S3 client configuration
 */
const getS3Client = () => {
  return new S3Client({
    region: process.env.AWS_REGION || 'us-east-1',
    credentials: {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID || '',
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || '',
    },
  });
};

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

export class ArtistService {
  /**
   * Create a new artist
   */
  static async createArtist(data: Prisma.ArtistCreateInput): Promise<ServiceResponse<Artist>> {
    try {
      const artist = (await prisma.artist.create({
        data,
      })) as unknown as Artist;
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
      const artist = (await prisma.artist.findUnique({
        where: { id },
        include: {
          images: {
            orderBy: { sortOrder: 'asc' },
          },
        },
      })) as unknown as Artist | null;

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
      const artist = (await prisma.artist.findUnique({
        where: { slug },
      })) as unknown as Artist | null;

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
   * Get all artists with optional filters
   */
  static async getArtists(params?: {
    skip?: number;
    take?: number;
    search?: string;
  }): Promise<ServiceResponse<Artist[]>> {
    try {
      const { skip = 0, take = 50, search } = params || {};

      const where: Prisma.ArtistWhereInput = {
        ...(search && {
          OR: [
            { firstName: { contains: search, mode: 'insensitive' } },
            { surname: { contains: search, mode: 'insensitive' } },
            { displayName: { contains: search, mode: 'insensitive' } },
            { slug: { contains: search, mode: 'insensitive' } },
          ],
        }),
      };

      const artists = (await prisma.artist.findMany({
        where,
        skip,
        take,
        orderBy: { createdAt: 'desc' },
        include: {
          images: {
            orderBy: { sortOrder: 'asc' },
            take: 3,
          },
        },
      })) as unknown as Artist[];

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
      const artist = (await prisma.artist.update({
        where: { id },
        data,
      })) as unknown as Artist;

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
      const artist = (await prisma.artist.delete({
        where: { id },
      })) as unknown as Artist;

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
      const artist = (await prisma.artist.update({
        where: { id },
        data: { deletedOn: new Date() },
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
      return { success: false, error: 'Failed to archive artist' };
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
      const artistExists = await prisma.artist.findUnique({
        where: { id: artistId },
        select: { id: true },
      });

      if (!artistExists) {
        return { success: false, error: 'Artist not found' };
      }

      const s3Client = getS3Client();
      const s3Bucket = process.env.S3_BUCKET;
      const cdnDomain = process.env.CDN_DOMAIN;

      if (!s3Bucket) {
        return { success: false, error: 'S3 bucket not configured' };
      }

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
      const existingImages = await prisma.image.findMany({
        where: { artistId },
        select: { id: true },
      });
      const nextSortOrder = existingImages.length;

      // Create Image record in database with sortOrder
      const image = await prisma.image.create({
        data: {
          src: imageUrl,
          caption: imageData.caption,
          altText: imageData.altText,
          artistId,
          sortOrder: nextSortOrder,
        } as Prisma.ImageCreateInput,
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
      const artistExists = await prisma.artist.findUnique({
        where: { id: artistId },
        select: { id: true },
      });

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
      const image = await prisma.image.findUnique({
        where: { id: imageId },
        select: { id: true, src: true, artistId: true },
      });

      if (!image) {
        return { success: false, error: 'Image not found' };
      }

      // Extract S3 key from URL
      const s3Bucket = process.env.S3_BUCKET;
      const cdnDomain = process.env.CDN_DOMAIN;

      if (image.src && s3Bucket) {
        let s3Key: string | null = null;

        if (cdnDomain && image.src.includes(cdnDomain)) {
          // Extract key from CDN URL
          s3Key = image.src.replace(`https://${cdnDomain}/`, '');
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
      await prisma.image.delete({
        where: { id: imageId },
      });

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
      const images = await prisma.image.findMany({
        where: { artistId },
        orderBy: { sortOrder: 'asc' } as Prisma.ImageOrderByWithRelationInput,
      });

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
      const image = await prisma.image.update({
        where: { id: imageId },
        data: {
          caption: data.caption,
          altText: data.altText,
        },
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
      const existingImages = await prisma.image.findMany({
        where: { artistId, id: { in: imageIds } },
        select: { id: true },
      });

      if (existingImages.length !== imageIds.length) {
        return { success: false, error: 'Some images not found or do not belong to this artist' };
      }

      // Update sort order for each image
      const updatePromises = imageIds.map((id, index) =>
        prisma.image.update({
          where: { id },
          data: { sortOrder: index } as Prisma.ImageUpdateInput,
        })
      );

      await Promise.all(updatePromises);

      // Fetch updated images in new order
      const updatedImages = await prisma.image.findMany({
        where: { artistId },
        orderBy: { sortOrder: 'asc' } as Prisma.ImageOrderByWithRelationInput,
      });

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
}
