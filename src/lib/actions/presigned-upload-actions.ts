/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use server';

import 'server-only';

import { PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

import { auth } from '@/auth';
import { requireRole } from '@/lib/utils/auth/require-role';
import { loggers } from '@/lib/utils/logger';
import { getS3BucketName, getS3Client } from '@/lib/utils/s3-client';
import { buildMediaS3Key } from '@/lib/utils/s3-key-utils';

const logger = loggers.presignedUrls;

/**
 * Input for requesting a presigned URL
 */
export interface PresignedUrlRequest {
  fileName: string;
  contentType: string;
  fileSize: number;
  /** If provided, generate presigned URL for this existing S3 key instead of a new one (for overwriting) */
  existingS3Key?: string;
}

/**
 * Result from presigned URL generation
 */
export interface PresignedUrlResult {
  uploadUrl: string;
  s3Key: string;
  cdnUrl: string;
}

/**
 * Action result type
 */
export interface PresignedUrlActionResult {
  success: boolean;
  data?: PresignedUrlResult[];
  error?: string;
}

/**
 * Maximum file sizes by category
 */
const MAX_FILE_SIZES = {
  image: 50 * 1024 * 1024, // 50MB for high-res images
  audio: 1024 * 1024 * 1024, // 1GB for lossless albums
  default: 50 * 1024 * 1024, // 50MB default
};

/**
 * Allowed content types by category
 */
const ALLOWED_CONTENT_TYPES = {
  image: ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/tiff'],
  audio: [
    // Lossless formats
    'audio/flac',
    'audio/x-flac',
    'audio/wav',
    'audio/x-wav',
    'audio/aiff',
    'audio/x-aiff',
    'audio/x-m4a', // ALAC
    'audio/alac',
    // Lossy formats
    'audio/mpeg', // MP3
    'audio/mp3',
    'audio/mp4', // AAC
    'audio/aac',
    'audio/ogg',
    'audio/opus',
    'audio/webm',
  ],
};

/**
 * Get the file category from content type
 */
const getFileCategory = (contentType: string): 'image' | 'audio' | null => {
  if (ALLOWED_CONTENT_TYPES.image.includes(contentType)) {
    return 'image';
  }
  if (ALLOWED_CONTENT_TYPES.audio.includes(contentType)) {
    return 'audio';
  }
  return null;
};

/**
 * Validate file type and size
 */
const validateFile = (
  contentType: string,
  fileSize: number
): { valid: boolean; error?: string } => {
  const category = getFileCategory(contentType);

  if (!category) {
    return {
      valid: false,
      error: `Invalid file type: ${contentType}. Allowed types: images and audio files.`,
    };
  }

  const maxFileSize = category === 'image' ? MAX_FILE_SIZES.image : MAX_FILE_SIZES.audio;
  const maxSizeMB = Math.round(maxFileSize / (1024 * 1024));

  if (fileSize > maxFileSize) {
    return {
      valid: false,
      error: `File exceeds maximum size of ${maxSizeMB}MB for ${category} files`,
    };
  }

  return { valid: true };
};

type EntityType =
  | 'artists'
  | 'releases'
  | 'tracks'
  | 'notifications'
  | 'featured-artists'
  | 'videos';

interface S3UploadContext {
  s3Client: ReturnType<typeof getS3Client>;
  s3Bucket: string;
  cdnDomain: string | undefined;
  awsRegion: string;
  entityType: EntityType;
  entityId: string;
}

/**
 * Validate all files and return an error result on the first failure.
 * Returns null when all files pass validation.
 */
const validateAllFiles = (files: PresignedUrlRequest[]): PresignedUrlActionResult | null => {
  for (const file of files) {
    const validation = validateFile(file.contentType, file.fileSize);
    if (!validation.valid) {
      logger.warn('File validation failed', {
        fileName: file.fileName,
        contentType: file.contentType,
        fileSize: file.fileSize,
        error: validation.error,
      });
      return { success: false, error: validation.error };
    }
  }
  return null;
};

/**
 * Resolve the S3 key for a single file, enforcing path-traversal safety on
 * existingS3Key values.
 */
const resolveS3Key = (
  file: PresignedUrlRequest,
  entityType: EntityType,
  entityId: string
): string => {
  if (!file.existingS3Key) {
    return buildMediaS3Key({ entityType, entityId, fileName: file.fileName });
  }
  const expectedPrefix = `media/${entityType}/${entityId}/`;
  if (!file.existingS3Key.startsWith(expectedPrefix) || file.existingS3Key.includes('..')) {
    throw new Error(`Invalid S3 key: must start with ${expectedPrefix}`);
  }
  return file.existingS3Key;
};

/**
 * Generate one presigned upload URL result for a single file.
 */
const buildPresignedUrlResult = async (
  file: PresignedUrlRequest,
  ctx: S3UploadContext
): Promise<PresignedUrlResult> => {
  const { s3Client, s3Bucket, cdnDomain, awsRegion, entityType, entityId } = ctx;
  const s3Key = resolveS3Key(file, entityType, entityId);

  const putCommand = new PutObjectCommand({
    Bucket: s3Bucket,
    Key: s3Key,
    ContentType: file.contentType,
    ContentLength: file.fileSize,
    CacheControl: 'public, max-age=31536000, immutable',
    Metadata: {
      entityType,
      entityId,
      originalFileName: file.fileName,
      uploadedAt: new Date().toISOString(),
    },
  });

  const uploadUrl = await getSignedUrl(s3Client, putCommand, { expiresIn: 900 });
  const s3DirectUrl = `https://${s3Bucket}.s3.${awsRegion}.amazonaws.com/${s3Key}`;
  const cdnUrl = cdnDomain ? `https://${cdnDomain}/${s3Key}` : s3DirectUrl;

  logger.debug('Generated presigned URL', {
    s3Key,
    cdnUrl,
    s3DirectUrl,
    uploadUrlHost: new URL(uploadUrl).hostname,
    bucket: s3Bucket,
    region: awsRegion,
  });

  return { uploadUrl, s3Key, cdnUrl };
};

/**
 * Server action to get presigned URLs for direct S3 upload
 * This allows clients to upload directly to S3, bypassing Next.js server body size limits
 */
export const getPresignedUploadUrlsAction = async (
  entityType: EntityType,
  entityId: string,
  files: PresignedUrlRequest[]
): Promise<PresignedUrlActionResult> => {
  const operation = 'getPresignedUploadUrls';

  logger.debug('Environment check', {
    hasAwsRegion: !!process.env.AWS_REGION,
    hasAwsAccessKey: !!process.env.AWS_ACCESS_KEY_ID,
    hasAwsSecretKey: !!process.env.AWS_SECRET_ACCESS_KEY,
    hasCdnDomain: !!process.env.CDN_DOMAIN,
  });

  try {
    await requireRole('admin');
    const session = await auth();

    if (!session) {
      return { success: false, error: 'Authentication required' };
    }

    if (files.length === 0) {
      logger.warn('No files provided for upload', { entityType, entityId });
      return { success: false, error: 'No files provided' };
    }

    const validationError = validateAllFiles(files);
    if (validationError) return validationError;

    const s3Client = getS3Client();
    const s3Bucket = getS3BucketName();
    const cdnDomainRaw = process.env.CDN_DOMAIN;
    // Strip any existing protocol from CDN domain to avoid double https://
    const cdnDomain = cdnDomainRaw?.replace(/^https?:\/\//, '');
    const awsRegion = process.env.AWS_REGION ?? 'us-east-1';
    const ctx: S3UploadContext = { s3Client, s3Bucket, cdnDomain, awsRegion, entityType, entityId };

    logger.operationStart(operation, {
      entityType,
      entityId,
      fileCount: files.length,
      userId: session.user.id,
    });

    // Each file's presigned URL is independent; generate them concurrently.
    // Promise.all preserves input order in the returned results array.
    const results = await Promise.all(files.map((file) => buildPresignedUrlResult(file, ctx)));

    logger.operationComplete(operation, {
      entityType,
      entityId,
      fileCount: files.length,
      userId: session.user.id,
    });

    return { success: true, data: results };
  } catch (error) {
    logger.operationFailed(operation, error, { entityType, entityId, fileCount: files.length });
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return { success: false, error: `Failed to generate upload URLs: ${errorMessage}` };
  }
};
