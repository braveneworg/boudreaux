/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import 'server-only';

import { DeleteObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

import type { ServiceResponse } from '@/lib/services/service.types';
import {
  MAX_FILE_SIZE,
  SUPPORTED_IMAGE_TYPES,
  type ImageUploadRequest,
  type PresignedUrlResponse,
} from '@/lib/validations/tours/image-schema';
import type { TourDateImageUploadRequest } from '@/lib/validations/tours/tour-date-image-schema';

/**
 * Get configured S3 client
 */
const getS3Client = (): S3Client => {
  return new S3Client({
    region: process.env.AWS_REGION || 'us-east-1',
    credentials: {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID || '',
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || '',
    },
  });
};

/**
 * Service for handling tour image uploads to S3
 */
export class ImageUploadService {
  /**
   * Generate a unique S3 key for an image
   */
  static generateS3Key(tourId: string, fileName: string): string {
    const timestamp = Date.now();
    const randomSuffix = Math.random().toString(36).substring(2, 8);
    const extension = fileName.split('.').pop()?.toLowerCase() || 'jpg';

    // Sanitize filename: lowercase, remove special chars, truncate
    const sanitizedName = fileName
      .replace(/\.[^/.]+$/, '') // Remove extension
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '-') // Replace non-alphanumeric with hyphens
      .replace(/-+/g, '-') // Replace multiple hyphens with single
      .replace(/^-|-$/g, '') // Remove leading/trailing hyphens
      .substring(0, 50); // Truncate to reasonable length

    return `media/tours/${tourId}/${sanitizedName}-${timestamp}-${randomSuffix}.${extension}`;
  }

  /**
   * Generate a unique S3 key for a tour date image
   */
  static generateTourDateS3Key(tourDateId: string, fileName: string): string {
    const timestamp = Date.now();
    const randomSuffix = Math.random().toString(36).substring(2, 8);
    const extension = fileName.split('.').pop()?.toLowerCase() || 'jpg';

    // Sanitize filename: lowercase, remove special chars, truncate
    const sanitizedName = fileName
      .replace(/\.[^/.]+$/, '') // Remove extension
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '-') // Replace non-alphanumeric with hyphens
      .replace(/-+/g, '-') // Replace multiple hyphens with single
      .replace(/^-|-$/g, '') // Remove leading/trailing hyphens
      .substring(0, 50); // Truncate to reasonable length

    return `media/tour-dates/${tourDateId}/${sanitizedName}-${timestamp}-${randomSuffix}.${extension}`;
  }

  /**
   * Generate CDN URL from S3 key
   */
  static generateCdnUrl(s3Key: string): string {
    const s3Bucket = process.env.S3_BUCKET || '';
    const cdnDomainRaw = process.env.CDN_DOMAIN || '';
    const awsRegion = process.env.AWS_REGION || 'us-east-1';

    // Strip protocol from CDN domain if present
    const cdnDomain = cdnDomainRaw.replace(/^https?:\/\//, '');

    if (cdnDomain) {
      return `https://${cdnDomain}/${s3Key}`;
    }

    // Fallback to S3 direct URL
    return `https://${s3Bucket}.s3.${awsRegion}.amazonaws.com/${s3Key}`;
  }

  /**
   * Validate image file metadata
   */
  static validateImageFile(mimeType: string, fileSize: number): { valid: boolean; error?: string } {
    // Check file size
    if (fileSize <= 0) {
      return { valid: false, error: 'Invalid file size' };
    }

    if (fileSize > MAX_FILE_SIZE) {
      return {
        valid: false,
        error: `File size exceeds maximum allowed size of ${MAX_FILE_SIZE / 1024 / 1024}MB`,
      };
    }

    // Check MIME type
    if (!SUPPORTED_IMAGE_TYPES.includes(mimeType as (typeof SUPPORTED_IMAGE_TYPES)[number])) {
      return {
        valid: false,
        error: `Invalid file type. Supported types: ${SUPPORTED_IMAGE_TYPES.join(', ')}`,
      };
    }

    return { valid: true };
  }

  /**
   * Generate a presigned URL for uploading an image to S3
   * URL expires in 15 minutes (900 seconds)
   */
  static async generatePresignedUploadUrl(
    request: ImageUploadRequest
  ): Promise<ServiceResponse<PresignedUrlResponse>> {
    try {
      const s3Bucket = process.env.S3_BUCKET;

      if (!s3Bucket) {
        return { success: false, error: 'S3 bucket not configured' };
      }

      // Validate file
      const validation = this.validateImageFile(request.mimeType, request.fileSize);
      if (!validation.valid) {
        return { success: false, error: validation.error || 'Invalid file' };
      }

      // Generate S3 key
      const s3Key = this.generateS3Key(request.tourId, request.fileName);

      // Create Put command for presigned URL
      const putCommand = new PutObjectCommand({
        Bucket: s3Bucket,
        Key: s3Key,
        ContentType: request.mimeType,
        CacheControl: 'public, max-age=31536000, immutable',
        Metadata: {
          tourId: request.tourId,
          originalFileName: request.fileName,
          uploadedAt: new Date().toISOString(),
        },
      });

      // Generate presigned URL (expires in 15 minutes)
      const s3Client = getS3Client();
      const uploadUrl = await getSignedUrl(s3Client, putCommand, { expiresIn: 900 });

      return {
        success: true,
        data: {
          uploadUrl,
          s3Key,
          s3Bucket,
          expiresIn: 900,
        },
      };
    } catch (error) {
      console.error('Error generating presigned URL:', error);
      return { success: false, error: 'Failed to generate upload URL' };
    }
  }

  /**
   * Generate a presigned URL for uploading a tour date image to S3
   * URL expires in 15 minutes (900 seconds)
   */
  static async generateTourDatePresignedUploadUrl(
    request: TourDateImageUploadRequest
  ): Promise<ServiceResponse<PresignedUrlResponse>> {
    try {
      const s3Bucket = process.env.S3_BUCKET;

      if (!s3Bucket) {
        return { success: false, error: 'S3 bucket not configured' };
      }

      // Validate file
      const validation = this.validateImageFile(request.mimeType, request.fileSize);
      if (!validation.valid) {
        return { success: false, error: validation.error || 'Invalid file' };
      }

      // Generate S3 key for tour date
      const s3Key = this.generateTourDateS3Key(request.tourDateId, request.fileName);

      // Create Put command for presigned URL
      const putCommand = new PutObjectCommand({
        Bucket: s3Bucket,
        Key: s3Key,
        ContentType: request.mimeType,
        CacheControl: 'public, max-age=31536000, immutable',
        Metadata: {
          tourDateId: request.tourDateId,
          originalFileName: request.fileName,
          uploadedAt: new Date().toISOString(),
        },
      });

      // Generate presigned URL (expires in 15 minutes)
      const s3Client = getS3Client();
      const uploadUrl = await getSignedUrl(s3Client, putCommand, { expiresIn: 900 });

      return {
        success: true,
        data: {
          uploadUrl,
          s3Key,
          s3Bucket,
          expiresIn: 900,
        },
      };
    } catch (error) {
      console.error('Error generating tour date presigned URL:', error);
      return { success: false, error: 'Failed to generate upload URL' };
    }
  }

  /**
   * Delete a file from S3
   */
  static async deleteFromS3(s3Key: string): Promise<ServiceResponse<void>> {
    try {
      const s3Bucket = process.env.S3_BUCKET;

      if (!s3Bucket) {
        return { success: false, error: 'S3 bucket not configured' };
      }

      const s3Client = getS3Client();
      const deleteCommand = new DeleteObjectCommand({
        Bucket: s3Bucket,
        Key: s3Key,
      });

      await s3Client.send(deleteCommand);

      return { success: true, data: undefined };
    } catch (error) {
      console.error('Error deleting from S3:', error);
      return { success: false, error: 'Failed to delete file from S3' };
    }
  }
}
