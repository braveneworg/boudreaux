/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import 'server-only';

import { DeleteObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

import type { ServiceResponse } from '@/lib/services/service.types';
import { loggers } from '@/lib/utils/logger';
import { getS3BucketName, getS3Client } from '@/lib/utils/s3-client';
import {
  MAX_FILE_SIZE,
  SUPPORTED_IMAGE_TYPES,
  type PresignedUrlResponse,
} from '@/lib/validation/tours/image-schema';

import type { TourImagePut } from './tour-images/types';

/** A presigned PUT is valid for 15 minutes. */
const PRESIGNED_PUT_TTL_SECONDS = 900;

/**
 * The S3 calls tour images make: sign a PUT, delete an object, and name the
 * URL an object is served from. The tour image module reaches them through
 * its S3 store adapter.
 */
export class ImageUploadService {
  /**
   * Generate CDN URL from S3 key
   */
  static generateCdnUrl(s3Key: string): string {
    const cdnDomainRaw = process.env.CDN_DOMAIN || '';
    const awsRegion = process.env.AWS_REGION || 'us-east-1';

    // Strip protocol from CDN domain if present
    const cdnDomain = cdnDomainRaw.replace(/^https?:\/\//, '');

    if (cdnDomain) {
      return `https://${cdnDomain}/${s3Key}`;
    }

    // Fallback to S3 direct URL
    const s3Bucket = getS3BucketName();
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
   * Sign a PUT of one image object under the key the caller chose. The URL
   * expires in 15 minutes (900 seconds); the object is cached as immutable.
   */
  static async presignPut({
    s3Key,
    mimeType,
    fileSize,
    metadata,
  }: TourImagePut): Promise<ServiceResponse<PresignedUrlResponse>> {
    try {
      const s3Bucket = getS3BucketName();

      const validation = this.validateImageFile(mimeType, fileSize);
      if (!validation.valid) {
        return { success: false, error: validation.error || 'Invalid file', code: 'VALIDATION' };
      }

      const putCommand = new PutObjectCommand({
        Bucket: s3Bucket,
        Key: s3Key,
        ContentType: mimeType,
        ContentLength: fileSize,
        CacheControl: 'public, max-age=31536000, immutable',
        Metadata: metadata,
      });

      const uploadUrl = await getSignedUrl(getS3Client(), putCommand, {
        expiresIn: PRESIGNED_PUT_TTL_SECONDS,
      });

      return {
        success: true,
        data: { uploadUrl, s3Key, s3Bucket, expiresIn: PRESIGNED_PUT_TTL_SECONDS },
      };
    } catch (error) {
      loggers.media.error('Error generating presigned URL', error);
      return { success: false, error: 'Failed to generate upload URL', code: 'UNKNOWN' };
    }
  }

  /**
   * Delete a file from S3
   */
  static async deleteFromS3(s3Key: string): Promise<ServiceResponse<void>> {
    try {
      const s3Bucket = getS3BucketName();

      const s3Client = getS3Client();
      const deleteCommand = new DeleteObjectCommand({
        Bucket: s3Bucket,
        Key: s3Key,
      });

      await s3Client.send(deleteCommand);

      return { success: true, data: undefined };
    } catch (error) {
      loggers.media.error('Error deleting from S3', error);
      return { success: false, error: 'Failed to delete file from S3', code: 'UNKNOWN' };
    }
  }
}
