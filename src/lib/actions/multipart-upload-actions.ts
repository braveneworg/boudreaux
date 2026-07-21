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
import { buildMediaS3Key } from '@/lib/utils/s3-key-utils';
import {
  abortVideoUploadSchema,
  completeVideoUploadSchema,
  initiateVideoUploadSchema,
  presignVideoPartsSchema,
} from '@/lib/validation/video-upload-schema';
import type { ActionResult } from '@/types/digital-format';

import { isInvalidS3Key } from './confirm-upload-action-helpers';
import {
  isLocalMultipartUpload,
  localAbortUpload,
  localCompleteUpload,
  localPartUploadUrl,
  localStartUpload,
} from './multipart-local-adapters';

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
 * Build a collision-resistant, namespaced key for a new video object. The
 * extension allowlist that used to live here now applies to every media upload
 * path — see `buildMediaS3Key`.
 */
const buildVideoS3Key = (videoId: string, fileName: string): string =>
  buildMediaS3Key({
    entityType: 'videos',
    entityId: videoId,
    fileName,
    fallbackExtension: 'mp4',
  });

/** Log and format a failed action into an error result. */
const failureResult = (operation: string, prefix: string, error: unknown): ErrorResult => {
  logger.operationFailed(operation, error, {});
  const message = error instanceof Error ? error.message : 'Unknown error';
  return { success: false, error: `${prefix}: ${message}` };
};

/*
 * ── The seam ──────────────────────────────────────────────────────────────
 *
 * The four operations below are the only things these actions cannot do
 * without AWS. Each has a real S3 implementation and a local one, chosen by a
 * single selector, so the admin gate, Zod validation, and key guard in every
 * action run identically on both paths — and so the browser uploader runs for
 * real under E2E instead of being short-circuited. See
 * `multipart-local-adapters.ts` for why this is the lowest workable seam.
 */

interface StartUploadParams {
  s3Key: string;
  contentType: string;
  videoId: string;
  fileName: string;
}

interface SignPartUrlsParams {
  s3Key: string;
  uploadId: string;
  partNumbers: number[];
}

interface FinishUploadParams {
  s3Key: string;
  uploadId: string;
  parts: Array<{ partNumber: number; eTag: string }>;
}

interface DiscardUploadParams {
  s3Key: string;
  uploadId: string;
}

const s3StartUpload = async ({
  s3Key,
  contentType,
  videoId,
  fileName,
}: StartUploadParams): Promise<string | undefined> => {
  const response = await getS3Client().send(
    new CreateMultipartUploadCommand({
      Bucket: getS3BucketName(),
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
  return response.UploadId;
};

/** Begin the upload; `undefined` when no upload id came back. */
const startUpload = async (params: StartUploadParams): Promise<string | undefined> =>
  isLocalMultipartUpload() ? localStartUpload({ s3Key: params.s3Key }) : s3StartUpload(params);

const s3SignPartUrls = async ({
  s3Key,
  uploadId,
  partNumbers,
}: SignPartUrlsParams): Promise<Array<{ partNumber: number; url: string }>> => {
  const s3Client = getS3Client();
  const bucket = getS3BucketName();
  return Promise.all(
    partNumbers.map(async (partNumber) => ({
      partNumber,
      url: await getSignedUrl(
        s3Client,
        new UploadPartCommand({
          Bucket: bucket,
          Key: s3Key,
          UploadId: uploadId,
          PartNumber: partNumber,
        }),
        { expiresIn: PRESIGNED_URL_EXPIRATION.UPLOAD }
      ),
    }))
  );
};

/** The URL the browser should PUT each part to. */
const signPartUrls = async (
  params: SignPartUrlsParams
): Promise<Array<{ partNumber: number; url: string }>> =>
  isLocalMultipartUpload()
    ? params.partNumbers.map((partNumber) => ({
        partNumber,
        url: localPartUploadUrl({ uploadId: params.uploadId, partNumber }),
      }))
    : s3SignPartUrls(params);

const s3FinishUpload = async ({
  s3Key,
  uploadId,
  parts,
}: FinishUploadParams): Promise<number | undefined> => {
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
  return head.ContentLength === undefined ? undefined : Number(head.ContentLength);
};

/** Assemble the parts and return the object's authoritative size. */
const finishUpload = async (params: FinishUploadParams): Promise<number | undefined> =>
  isLocalMultipartUpload() ? localCompleteUpload(params) : s3FinishUpload(params);

const s3DiscardUpload = async ({ s3Key, uploadId }: DiscardUploadParams): Promise<void> => {
  await getS3Client().send(
    new AbortMultipartUploadCommand({
      Bucket: getS3BucketName(),
      Key: s3Key,
      UploadId: uploadId,
    })
  );
};

/** Throw away an unfinished upload and its parts. */
const discardUpload = async (params: DiscardUploadParams): Promise<void> =>
  isLocalMultipartUpload() ? localAbortUpload(params.uploadId) : s3DiscardUpload(params);

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

    const s3Key = buildVideoS3Key(videoId, fileName);
    const uploadId = await startUpload({ s3Key, contentType, videoId, fileName });

    if (!uploadId) {
      return { success: false, error: 'S3 did not return an upload id' };
    }

    return {
      success: true,
      data: {
        s3Key,
        uploadId,
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

    return { success: true, data: await signPartUrls({ s3Key, uploadId, partNumbers }) };
  } catch (error) {
    return failureResult('presignVideoParts', 'Failed to presign video parts', error);
  }
};

/**
 * Server Action: complete a multipart upload and return the assembled object's
 * authoritative size (an S3 `HeadObject`, or the local store's total of the
 * delivered parts — see {@link finishUpload}).
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

    const fileSize = await finishUpload({ s3Key, uploadId, parts });
    if (fileSize === undefined) {
      return { success: false, error: 'Uploaded video could not be verified in storage' };
    }

    return { success: true, data: { s3Key, fileSize } };
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
      await discardUpload({ s3Key, uploadId });
    } catch (error) {
      logger.error('Failed to abort multipart video upload', error);
    }

    return { success: true, data: null };
  } catch (error) {
    return failureResult('abortVideoUpload', 'Failed to abort video upload', error);
  }
};
