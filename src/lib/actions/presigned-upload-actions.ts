'use server';

import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

import { requireRole } from '@/lib/utils/auth/require-role';
import { loggers } from '@/lib/utils/logger';

import { auth } from '../../../auth';

const logger = loggers.presignedUrls;

// Log at module load time for debugging
logger.info('Module loaded', {
  s3BucketConfigured: !!process.env.S3_BUCKET,
});

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
const generateS3Key = (
  entityType: 'artists' | 'groups' | 'releases' | 'tracks' | 'notifications' | 'featured-artists',
  entityId: string,
  fileName: string
): string => {
  const timestamp = Date.now();
  const randomSuffix = Math.random().toString(36).substring(2, 8);
  const extension = fileName.split('.').pop()?.toLowerCase() || 'jpg';
  const sanitizedName = fileName
    .replace(/\.[^/.]+$/, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '-')
    .substring(0, 50);

  return `media/${entityType}/${entityId}/${sanitizedName}-${timestamp}-${randomSuffix}.${extension}`;
};

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

  const maxFileSize = MAX_FILE_SIZES[category];
  const maxSizeMB = Math.round(maxFileSize / (1024 * 1024));

  if (fileSize > maxFileSize) {
    return {
      valid: false,
      error: `File exceeds maximum size of ${maxSizeMB}MB for ${category} files`,
    };
  }

  return { valid: true };
};

/**
 * Server action to get presigned URLs for direct S3 upload
 * This allows clients to upload directly to S3, bypassing Next.js server body size limits
 */
export const getPresignedUploadUrlsAction = async (
  entityType: 'artists' | 'groups' | 'releases' | 'tracks' | 'notifications' | 'featured-artists',
  entityId: string,
  files: PresignedUrlRequest[]
): Promise<PresignedUrlActionResult> => {
  const operation = 'getPresignedUploadUrls';

  // Log environment variables availability (not values for security)
  logger.debug('Environment check', {
    hasS3Bucket: !!process.env.S3_BUCKET,
    hasAwsRegion: !!process.env.AWS_REGION,
    hasAwsAccessKey: !!process.env.AWS_ACCESS_KEY_ID,
    hasAwsSecretKey: !!process.env.AWS_SECRET_ACCESS_KEY,
    hasCdnDomain: !!process.env.CDN_DOMAIN,
  });

  await requireRole('admin');

  try {
    const session = await auth();

    if (!session?.user?.id || session?.user?.role !== 'admin') {
      logger.warn('Unauthorized access attempt', {
        hasSession: !!session,
        hasUserId: !!session?.user?.id,
        role: session?.user?.role,
      });
      return { success: false, error: 'Unauthorized' };
    }

    if (files.length === 0) {
      logger.warn('No files provided for upload', { entityType, entityId });
      return { success: false, error: 'No files provided' };
    }

    // Validate all files first
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

    const s3Client = getS3Client();
    const s3Bucket = process.env.S3_BUCKET;
    const cdnDomainRaw = process.env.CDN_DOMAIN;
    // Strip any existing protocol from CDN domain to avoid double https://
    const cdnDomain = cdnDomainRaw?.replace(/^https?:\/\//, '');
    const awsRegion = process.env.AWS_REGION || 'us-east-1';

    if (!s3Bucket) {
      logger.error('S3_BUCKET environment variable is not set');
      return {
        success: false,
        error: 'S3 storage is not configured. Please contact an administrator.',
      };
    }

    logger.operationStart(operation, {
      entityType,
      entityId,
      fileCount: files.length,
      userId: session.user.id,
    });

    const results: PresignedUrlResult[] = [];

    for (const file of files) {
      // Use existing S3 key for overwrites, or generate a new one
      const s3Key = file.existingS3Key || generateS3Key(entityType, entityId, file.fileName);

      const putCommand = new PutObjectCommand({
        Bucket: s3Bucket,
        Key: s3Key,
        ContentType: file.contentType,
        // Note: Not including ContentLength in presigned URL to avoid size mismatch issues
        // S3 will still accept the upload and determine the size from the actual content
        CacheControl: 'public, max-age=31536000, immutable',
        Metadata: {
          entityType,
          entityId,
          originalFileName: file.fileName,
          uploadedAt: new Date().toISOString(),
        },
      });

      // Generate presigned URL with 15 minute expiry
      const uploadUrl = await getSignedUrl(s3Client, putCommand, { expiresIn: 900 });

      // Construct the CDN URL
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

      results.push({
        uploadUrl,
        s3Key,
        cdnUrl,
      });
    }

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
