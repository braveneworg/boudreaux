/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import 'server-only';

import { GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

import {
  getDefaultMimeType,
  PRESIGNED_URL_EXPIRATION,
  type DigitalFormatType,
} from '@/lib/constants/digital-formats';
import { generateCloudFrontSignedUrl } from '@/lib/utils/cloudfront-signed-url';

/**
 * Get configured S3 client for AWS operations
 *
 * Lazy initialization pattern - creates client only when needed
 */
export function getS3Client(): S3Client {
  const region = process.env.AWS_REGION || 'us-east-1';
  const accessKeyId = process.env.AWS_ACCESS_KEY_ID;
  const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY;

  if (!accessKeyId || !secretAccessKey) {
    throw new Error('AWS credentials not configured (AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY)');
  }

  return new S3Client({
    region,
    credentials: {
      accessKeyId,
      secretAccessKey,
    },
  });
}

/**
 * Get S3 bucket name from environment variables
 *
 * @throws {Error} If S3_BUCKET or AWS_S3_BUCKET_NAME not configured
 */
export function getS3BucketName(): string {
  const bucketName = process.env.AWS_S3_BUCKET_NAME || process.env.S3_BUCKET;

  if (!bucketName) {
    throw new Error(
      'S3 bucket not configured (set AWS_S3_BUCKET_NAME or S3_BUCKET environment variable)'
    );
  }

  return bucketName;
}

/**
 * Generate presigned PUT URL for uploading digital audio files to S3
 *
 * @param s3Key - S3 object key (path within bucket)
 * @param formatType - Digital format type for MIME type inference
 * @param mimeType - MIME type of the audio file
 * @returns Presigned URL valid for 15 minutes
 *
 * @example
 * ```ts
 * const uploadUrl = await generatePresignedUploadUrl(
 *   'releases/65f8a3b2c4d5e6f7a8b9c0d1/digital-formats/MP3_320KBPS/abc-123.mp3',
 *   'MP3_320KBPS',
 *   'audio/mpeg',
 *   '65f8a3b2c4d5e6f7a8b9c0d1',
 *   'album.mp3'
 * );
 * ```
 */
export async function generatePresignedUploadUrl(
  s3Key: string,
  formatType: DigitalFormatType,
  mimeType: string
): Promise<{ uploadUrl: string; s3Key: string; contentType: string }> {
  const s3Client = getS3Client();
  const bucketName = getS3BucketName();

  const resolvedContentType = mimeType || getDefaultMimeType(formatType);

  const putCommand = new PutObjectCommand({
    Bucket: bucketName,
    Key: s3Key,
    ContentType: resolvedContentType,
    CacheControl: 'public, max-age=31536000, immutable',
  });

  // Generate presigned URL with 15-minute expiration
  const uploadUrl = await getSignedUrl(s3Client, putCommand, {
    expiresIn: PRESIGNED_URL_EXPIRATION.UPLOAD, // 900 seconds = 15 minutes
  });

  return { uploadUrl, s3Key, contentType: resolvedContentType };
}

/**
 * Build an RFC 6266 Content-Disposition header value.
 *
 * - `filename` — ASCII-safe fallback (quotes and backslashes escaped).
 * - `filename*` — RFC 5987 UTF-8 encoded form for non-ASCII characters.
 *
 * Using `encodeURIComponent` inside the quoted `filename` parameter is
 * incorrect per the RFC and causes Safari to misidentify the file
 * extension (appending `.download` instead of `.zip`).
 */
export function buildContentDisposition(fileName: string): string {
  const asciiSafe = fileName.replace(/[\\"/]/g, '_');
  const encoded = encodeURIComponent(fileName).replace(/%20/g, '+');
  return `attachment; filename="${asciiSafe}"; filename*=UTF-8''${encoded}`;
}

/**
 * Generate presigned GET URL for downloading digital audio files from S3
 *
 * @param s3Key - S3 object key (path within bucket)
 * @param fileName - Suggested filename for Content-Disposition header
 * @param expiresInSeconds - URL expiration in seconds (defaults to 24 hours)
 * @returns Presigned URL valid for the requested expiration (24 hours by default)
 *
 * @example
 * ```ts
 * const downloadUrl = await generatePresignedDownloadUrl(
 *   'releases/65f8a3b2c4d5e6f7a8b9c0d1/digital-formats/MP3_320KBPS/abc-123.mp3',
 *   'Artist - Album - MP3 320kbps.mp3'
 * );
 * ```
 */
export async function generatePresignedDownloadUrl(
  s3Key: string,
  fileName: string,
  expiresInSeconds: number = PRESIGNED_URL_EXPIRATION.DOWNLOAD
): Promise<string> {
  // Prefer CloudFront signed URLs when configured — bytes flow through the
  // CDN edge cache (cheap repeat downloads, ~$0 on cache hit) instead of
  // egressing direct from S3 every time. Falls back to S3 presigned URLs
  // automatically when CloudFront keys are not configured (dev / E2E / CI).
  const cloudFrontUrl = generateCloudFrontSignedUrl({
    s3Key,
    fileName,
    expiresInSeconds,
  });
  if (cloudFrontUrl) {
    return cloudFrontUrl;
  }

  const s3Client = getS3Client();
  const bucketName = getS3BucketName();

  const getCommand = new GetObjectCommand({
    Bucket: bucketName,
    Key: s3Key,
    ResponseContentDisposition: buildContentDisposition(fileName),
    ResponseContentType: 'application/octet-stream', // Force binary download — prevents iOS Safari from appending .download extension
  });

  // Generate presigned URL with configurable expiration (24 hours by default)
  const downloadUrl = await getSignedUrl(s3Client, getCommand, {
    expiresIn: expiresInSeconds,
  });

  return downloadUrl;
}

/**
 * Verify S3 object exists (HEAD request)
 *
 * Used to confirm successful upload before creating database record.
 *
 * @param s3Key - S3 object key to check
 * @returns True if object exists, false otherwise
 */
export async function verifyS3ObjectExists(s3Key: string): Promise<boolean> {
  try {
    const s3Client = getS3Client();
    const bucketName = getS3BucketName();

    // HEAD request to check if object exists without downloading
    const { HeadObjectCommand } = await import('@aws-sdk/client-s3');
    const headCommand = new HeadObjectCommand({
      Bucket: bucketName,
      Key: s3Key,
    });

    await s3Client.send(headCommand);
    return true;
  } catch {
    // Object doesn't exist or access denied
    return false;
  }
}

/**
 * Delete S3 object (for permanent hard delete after grace period)
 *
 * @param s3Key - S3 object key to delete
 * @returns True if deletion succeeded, false otherwise
 */
export async function deleteS3Object(s3Key: string): Promise<boolean> {
  try {
    const s3Client = getS3Client();
    const bucketName = getS3BucketName();

    const { DeleteObjectCommand } = await import('@aws-sdk/client-s3');
    const deleteCommand = new DeleteObjectCommand({
      Bucket: bucketName,
      Key: s3Key,
    });

    await s3Client.send(deleteCommand);
    return true;
  } catch (error) {
    console.error('Failed to delete S3 object:', error);
    return false;
  }
}
