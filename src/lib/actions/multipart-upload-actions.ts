/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use server';

import 'server-only';

import {
  AbortMultipartUploadCommand,
  CompleteMultipartUploadCommand,
  CreateMultipartUploadCommand,
  HeadObjectCommand,
  UploadPartCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

import { auth } from '@/auth';
import { PRESIGNED_URL_EXPIRATION } from '@/lib/constants/digital-formats';
import { VIDEO_KEY_PREFIX, VIDEO_PART_SIZE } from '@/lib/constants/video-uploads';
import { requireRole } from '@/lib/utils/auth/require-role';
import { loggers } from '@/lib/utils/logger';
import { getS3BucketName, getS3Client } from '@/lib/utils/s3-client';
import {
  abortVideoUploadSchema,
  completeVideoUploadSchema,
  initiateVideoUploadSchema,
  presignVideoPartsSchema,
} from '@/lib/validation/video-upload-schema';
import type { ActionResult } from '@/types/digital-format';

import { isInvalidS3Key } from './confirm-upload-action-helpers';

const logger = loggers.s3;

/**
 * Untrusted request shapes for the multipart actions. Kept intentionally
 * permissive (like `PresignedUrlRequest`): every field is re-validated at
 * runtime by the matching Zod schema before use, so a malicious client cannot
 * bypass a guard by claiming a narrower type.
 */
interface InitiateVideoUploadRequest {
  videoId: string;
  fileName: string;
  contentType: string;
  fileSize: number;
}

interface PresignVideoPartsRequest {
  s3Key: string;
  uploadId: string;
  partNumbers: number[];
}

interface CompleteVideoUploadRequest {
  s3Key: string;
  uploadId: string;
  parts: Array<{ partNumber: number; eTag: string }>;
}

interface AbortVideoUploadRequest {
  s3Key: string;
  uploadId: string;
}

/** Shape returned when an action rejects a request before doing any work. */
type ErrorResult = { success: false; error: string };

/**
 * Enforce admin access. Returns an error result when the session is missing;
 * a non-admin caller causes `requireRole` to throw, which the caller's
 * try/catch converts into an error result. Returns `null` when authorized.
 */
const requireAdminSession = async (): Promise<ErrorResult | null> => {
  await requireRole('admin');
  const session = await auth();
  if (!session) {
    return { success: false, error: 'Authentication required' };
  }
  return null;
};

/**
 * Reject spoofed S3 keys before any SDK call: keys must sit under the video
 * namespace and may not attempt directory traversal.
 */
const guardVideoKey = (key: string): ErrorResult | null =>
  isInvalidS3Key(key, VIDEO_KEY_PREFIX)
    ? { success: false, error: `Invalid S3 key: must start with ${VIDEO_KEY_PREFIX}` }
    : null;

/**
 * Build a collision-resistant, namespaced key for a new video object. Mirrors
 * `generateS3Key` in presigned-upload-actions (which is not exported): the
 * original name is lowercased, stripped of its extension, reduced to
 * URL-safe characters, and truncated before the timestamp + random suffix.
 */
const buildVideoS3Key = (videoId: string, fileName: string): string => {
  const timestamp = Date.now();
  const randomSuffix = Math.random().toString(36).substring(2, 8);
  // Allowlist the extension so a crafted name (e.g. `clip.mp4/evil`) cannot
  // inject an extra path segment into the key; fall back to `mp4` otherwise.
  const rawExtension = fileName.split('.').pop()?.toLowerCase() ?? '';
  const extension = /^[a-z0-9]{1,8}$/.test(rawExtension) ? rawExtension : 'mp4';
  const sanitizedName = fileName
    .replace(/\.[^/.]+$/, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '-')
    .substring(0, 50);

  return `${VIDEO_KEY_PREFIX}${videoId}/${sanitizedName}-${timestamp}-${randomSuffix}.${extension}`;
};

/** Log and format a failed action into an error result. */
const failureResult = (operation: string, prefix: string, error: unknown): ErrorResult => {
  logger.operationFailed(operation, error, {});
  const message = error instanceof Error ? error.message : 'Unknown error';
  return { success: false, error: `${prefix}: ${message}` };
};

/**
 * Server Action: begin a multipart upload for a video and return the S3 key,
 * upload id, and the part sizing the client should use.
 */
export const initiateVideoUploadAction = async (
  input: InitiateVideoUploadRequest
): Promise<
  ActionResult<{ s3Key: string; uploadId: string; partSize: number; partCount: number }>
> => {
  try {
    const authError = await requireAdminSession();
    if (authError) return authError;

    const parsed = initiateVideoUploadSchema.safeParse(input);
    if (!parsed.success) {
      return { success: false, error: parsed.error.issues[0].message };
    }
    const { videoId, fileName, contentType, fileSize } = parsed.data;

    const s3Client = getS3Client();
    const bucket = getS3BucketName();
    const s3Key = buildVideoS3Key(videoId, fileName);

    const response = await s3Client.send(
      new CreateMultipartUploadCommand({
        Bucket: bucket,
        Key: s3Key,
        ContentType: contentType,
        CacheControl: 'public, max-age=31536000, immutable',
        Metadata: {
          entityType: 'videos',
          entityId: videoId,
          originalFileName: fileName,
          uploadedAt: new Date().toISOString(),
        },
      })
    );

    if (!response.UploadId) {
      return { success: false, error: 'S3 did not return an upload id' };
    }

    return {
      success: true,
      data: {
        s3Key,
        uploadId: response.UploadId,
        partSize: VIDEO_PART_SIZE,
        partCount: Math.ceil(fileSize / VIDEO_PART_SIZE),
      },
    };
  } catch (error) {
    return failureResult('initiateVideoUpload', 'Failed to initiate video upload', error);
  }
};

/**
 * Server Action: presign a just-in-time batch of `UploadPart` URLs for parts
 * the client is about to send.
 */
export const presignVideoPartsAction = async (
  input: PresignVideoPartsRequest
): Promise<ActionResult<Array<{ partNumber: number; url: string }>>> => {
  try {
    const authError = await requireAdminSession();
    if (authError) return authError;

    const parsed = presignVideoPartsSchema.safeParse(input);
    if (!parsed.success) {
      return { success: false, error: parsed.error.issues[0].message };
    }
    const { s3Key, uploadId, partNumbers } = parsed.data;

    const keyError = guardVideoKey(s3Key);
    if (keyError) return keyError;

    const s3Client = getS3Client();
    const bucket = getS3BucketName();

    const urls = await Promise.all(
      partNumbers.map(async (partNumber) => {
        const url = await getSignedUrl(
          s3Client,
          new UploadPartCommand({
            Bucket: bucket,
            Key: s3Key,
            UploadId: uploadId,
            PartNumber: partNumber,
          }),
          { expiresIn: PRESIGNED_URL_EXPIRATION.UPLOAD }
        );
        return { partNumber, url };
      })
    );

    return { success: true, data: urls };
  } catch (error) {
    return failureResult('presignVideoParts', 'Failed to presign video parts', error);
  }
};

/**
 * Server Action: complete a multipart upload, then HEAD-verify the assembled
 * object and return its authoritative size.
 */
export const completeVideoUploadAction = async (
  input: CompleteVideoUploadRequest
): Promise<ActionResult<{ s3Key: string; fileSize: number }>> => {
  try {
    const authError = await requireAdminSession();
    if (authError) return authError;

    const parsed = completeVideoUploadSchema.safeParse(input);
    if (!parsed.success) {
      return { success: false, error: parsed.error.issues[0].message };
    }
    const { s3Key, uploadId, parts } = parsed.data;

    const keyError = guardVideoKey(s3Key);
    if (keyError) return keyError;

    const s3Client = getS3Client();
    const bucket = getS3BucketName();

    const sortedParts = [...parts]
      .sort((a, b) => a.partNumber - b.partNumber)
      .map((part) => ({ PartNumber: part.partNumber, ETag: part.eTag }));

    await s3Client.send(
      new CompleteMultipartUploadCommand({
        Bucket: bucket,
        Key: s3Key,
        UploadId: uploadId,
        MultipartUpload: { Parts: sortedParts },
      })
    );

    const head = await s3Client.send(new HeadObjectCommand({ Bucket: bucket, Key: s3Key }));
    if (head.ContentLength === undefined) {
      return { success: false, error: 'Uploaded video could not be verified in storage' };
    }

    return { success: true, data: { s3Key, fileSize: Number(head.ContentLength) } };
  } catch (error) {
    return failureResult('completeVideoUpload', 'Failed to complete video upload', error);
  }
};

/**
 * Server Action: abort a multipart upload. Best-effort cleanup — an SDK
 * failure is logged but still reported as success, since the caller can do
 * nothing useful with a failed abort.
 */
export const abortVideoUploadAction = async (
  input: AbortVideoUploadRequest
): Promise<ActionResult<null>> => {
  try {
    const authError = await requireAdminSession();
    if (authError) return authError;

    const parsed = abortVideoUploadSchema.safeParse(input);
    if (!parsed.success) {
      return { success: false, error: parsed.error.issues[0].message };
    }
    const { s3Key, uploadId } = parsed.data;

    const keyError = guardVideoKey(s3Key);
    if (keyError) return keyError;

    try {
      const s3Client = getS3Client();
      const bucket = getS3BucketName();
      await s3Client.send(
        new AbortMultipartUploadCommand({ Bucket: bucket, Key: s3Key, UploadId: uploadId })
      );
    } catch (error) {
      logger.error('Failed to abort multipart video upload', error);
    }

    return { success: true, data: null };
  } catch (error) {
    return failureResult('abortVideoUpload', 'Failed to abort video upload', error);
  }
};
