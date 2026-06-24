/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { randomUUID } from 'node:crypto';
import { createReadStream, createWriteStream } from 'node:fs';
import { stat, unlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { extname, join } from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';

import { NextResponse } from 'next/server';

import { Upload } from '@aws-sdk/lib-storage';

import { supportsComment, writeComment } from '@/lib/audio-metadata';
import { VALID_FORMAT_TYPES, getDefaultMimeType } from '@/lib/constants/digital-formats';
import type { DigitalFormatType } from '@/lib/constants/digital-formats';
import { withAdmin } from '@/lib/decorators/with-auth';
import { UploadService } from '@/lib/services/upload-service';
import { loggers } from '@/lib/utils/logger';
import { getS3BucketName, getS3Client } from '@/lib/utils/s3-client';

import type { ReadableStream as NodeReadableStream } from 'node:stream/web';

/** Allow long-running uploads (5 min) for large audio files (WAV up to 500 MB). */
export const maxDuration = 300;

// ---------------------------------------------------------------------------
// Tagged-result types
// ---------------------------------------------------------------------------

type UploadMetadata =
  | {
      ok: true;
      fileName: string;
      fileSize: number;
      mimeType: string;
      trackNumber: number | undefined;
    }
  | { ok: false; response: NextResponse };

type BaseUrlResult = { ok: true; url: string } | { ok: false; response: NextResponse };

/** Wraps a failed-file-validation response so the handler can early-return. */
type FileValidationResult = { ok: true } | { ok: false; response: NextResponse };

// ---------------------------------------------------------------------------
// Module-scoped helpers (stateless, fully typed)
// ---------------------------------------------------------------------------

/**
 * Reads file-metadata headers, decodes the file name, validates size, and logs
 * the "file=… size=…MB mime=…" line. Returns a tagged result so the handler
 * can early-return without knowing the response shape.
 */
const parseUploadMetadata = (request: Request, formatType: DigitalFormatType): UploadMetadata => {
  const rawFileName = request.headers.get('x-file-name');
  const fileSizeHeader = request.headers.get('x-file-size');
  const mimeType = request.headers.get('content-type') ?? '';
  const trackNumberHeader = request.headers.get('x-track-number');

  if (!rawFileName || !fileSizeHeader) {
    loggers.s3.warn(`[upload-proxy] Missing metadata headers for ${formatType}`);
    return {
      ok: false,
      response: NextResponse.json(
        {
          success: false,
          error: 'MISSING_METADATA',
          message: 'x-file-name and x-file-size headers are required.',
        },
        { status: 400 }
      ),
    };
  }

  // Decode URI-encoded file name (encoded client-side for safe HTTP header transport)
  const fileName = decodeURIComponent(rawFileName);

  const fileSize = parseInt(fileSizeHeader, 10);
  if (isNaN(fileSize) || fileSize <= 0) {
    return {
      ok: false,
      response: NextResponse.json(
        {
          success: false,
          error: 'INVALID_SIZE',
          message: 'x-file-size must be a positive integer.',
        },
        { status: 400 }
      ),
    };
  }

  loggers.s3.info(
    `[upload-proxy] ${formatType}: file="${fileName}" size=${(fileSize / 1024 / 1024).toFixed(1)}MB mime=${mimeType || '(empty)'}`
  );

  const trackNumber = trackNumberHeader ? parseInt(trackNumberHeader, 10) : undefined;

  return { ok: true, fileName, fileSize, mimeType, trackNumber };
};

/**
 * Reads NEXT_PUBLIC_HOST_NAME / NEXT_PUBLIC_BASE_URL, validates the value is a
 * parseable absolute URL, and returns it. Returns a tagged failure with the
 * appropriate 500 response when config is absent or malformed.
 */
const resolveValidatedBaseUrl = (): BaseUrlResult => {
  const baseUrl =
    process.env.NEXT_PUBLIC_HOST_NAME?.trim() || process.env.NEXT_PUBLIC_BASE_URL?.trim();

  if (!baseUrl) {
    loggers.s3.error(
      '[upload-proxy] Missing NEXT_PUBLIC_HOST_NAME/NEXT_PUBLIC_BASE_URL while writing audio metadata comment.'
    );
    return {
      ok: false,
      response: NextResponse.json(
        {
          success: false,
          error: 'SERVER_CONFIGURATION_ERROR',
          message:
            'Server configuration is invalid: NEXT_PUBLIC_HOST_NAME or NEXT_PUBLIC_BASE_URL is not set.',
        },
        { status: 500 }
      ),
    };
  }

  try {
    const url = new URL(baseUrl).toString();
    return { ok: true, url };
  } catch {
    loggers.s3.error(
      '[upload-proxy] Invalid NEXT_PUBLIC_HOST_NAME/NEXT_PUBLIC_BASE_URL while writing audio metadata comment.'
    );
    return {
      ok: false,
      response: NextResponse.json(
        {
          success: false,
          error: 'SERVER_CONFIGURATION_ERROR',
          message:
            'Server configuration is invalid: NEXT_PUBLIC_HOST_NAME or NEXT_PUBLIC_BASE_URL must be a valid absolute URL.',
        },
        { status: 500 }
      ),
    };
  }
};

/**
 * Constructs the S3 key for a format upload, mirroring
 * UploadService.generatePresignedUploadUrl logic.
 */
const buildUploadS3Key = (args: {
  releaseId: string;
  formatType: DigitalFormatType;
  fileName: string;
  trackNumber: number | undefined;
}): string => {
  const { releaseId, formatType, fileName, trackNumber } = args;
  const timestamp = Date.now();
  const sanitizedFileName = fileName.replace(/[^a-zA-Z0-9.-]/g, '-');
  const trackPrefix = trackNumber != null ? `tracks/${trackNumber}-` : '';
  return `releases/${releaseId}/digital-formats/${formatType}/${trackPrefix}${timestamp}-${sanitizedFileName}`;
};

/**
 * Validates the parsed file info against format-specific rules via UploadService,
 * and ensures the request body is present. Returns a tagged failure on either check.
 */
const validateUploadRequest = (args: {
  request: Request;
  formatType: DigitalFormatType;
  fileName: string;
  fileSize: number;
  mimeType: string;
}): FileValidationResult => {
  const { request, formatType, fileName, fileSize, mimeType } = args;
  const uploadService = new UploadService();
  const validation = uploadService.validateFileInfo({ formatType, fileName, fileSize, mimeType });

  if (!validation.valid) {
    loggers.s3.warn(`[upload-proxy] Validation failed for ${formatType}: ${validation.error}`);
    return {
      ok: false,
      response: NextResponse.json(
        { success: false, error: 'VALIDATION_FAILED', message: validation.error },
        { status: 400 }
      ),
    };
  }

  if (!request.body) {
    loggers.s3.warn(`[upload-proxy] Empty request body for ${formatType}`);
    return {
      ok: false,
      response: NextResponse.json(
        { success: false, error: 'NO_BODY', message: 'Request body is empty.' },
        { status: 400 }
      ),
    };
  }

  return { ok: true };
};

/**
 * Deletes a temp file after upload, logging a warning (with error details) on failure.
 * Called in the finally block so upload errors do not suppress cleanup.
 */
const cleanupTempFile = async (tempFilePath: string): Promise<void> => {
  try {
    await unlink(tempFilePath);
  } catch (error) {
    loggers.s3.warn('[upload-proxy] Failed to clean up temp file', {
      tempFilePath,
      error:
        error instanceof Error
          ? { message: error.message, name: error.name, stack: error.stack }
          : error,
    });
  }
};

/**
 * Opens the temp file as a read stream, creates an AWS multipart Upload, wires
 * the progress handler, and awaits completion. Logs start, progress, and finish.
 */
const uploadTempFileToS3 = async (args: {
  tempFilePath: string;
  s3Key: string;
  contentType: string;
  formatType: DigitalFormatType;
  actualFileSize: number;
  startTime: number;
}): Promise<void> => {
  const { tempFilePath, s3Key, contentType, formatType, actualFileSize, startTime } = args;

  const s3Client = getS3Client();
  const bucketName = getS3BucketName();

  loggers.s3.info(`[upload-proxy] ${formatType}: starting S3 multipart upload to key=${s3Key}`);

  const fileStream = createReadStream(tempFilePath);
  const upload = new Upload({
    client: s3Client,
    params: {
      Bucket: bucketName,
      Key: s3Key,
      Body: fileStream,
      ContentType: contentType,
      ContentLength: actualFileSize,
    },
    // 10 MB part size — balances memory usage with upload throughput
    partSize: 10 * 1024 * 1024,
    // Up to 4 concurrent part uploads to S3
    queueSize: 4,
    leavePartsOnError: false,
  });

  upload.on('httpUploadProgress', (progress) => {
    const loaded = progress.loaded ?? 0;
    const pct = actualFileSize > 0 ? ((loaded / actualFileSize) * 100).toFixed(1) : '?';
    loggers.s3.info(
      `[upload-proxy] ${formatType}: progress ${pct}% (${(loaded / 1024 / 1024).toFixed(1)}MB / ${(actualFileSize / 1024 / 1024).toFixed(1)}MB)`
    );
  });

  await upload.done();

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  loggers.s3.info(`[upload-proxy] ${formatType}: COMPLETE in ${elapsed}s — s3Key=${s3Key}`);
};

// ---------------------------------------------------------------------------
// Route handler
// ---------------------------------------------------------------------------

/**
 * PUT /api/releases/[id]/upload/[formatType]
 *
 * Proxy upload endpoint — receives file from browser and uploads to S3 server-side.
 * Uses @aws-sdk/lib-storage `Upload` for automatic multipart streaming, avoiding
 * buffering the entire file into memory (which caused OOM / stalls on large files).
 *
 * Flow:
 * 1. Authenticate user as admin (JWT token)
 * 2. Validate format type and file metadata headers
 * 3. Validate file size/MIME constraints via UploadService
 * 4. Stream file body to temp file
 * 5. Edit comment tag in temp file to include comment to visit site URL
 * 6. Upload processed file to S3 via multipart Upload (no CORS needed)
 * 7. Clean up temp file
 * 8. Return { s3Key, contentType } for the client to pass to confirmDigitalFormatUploadAction
 */
export const PUT = withAdmin<{ id: string; formatType: string }>(async (request, context) => {
  const startTime = Date.now();

  try {
    const { id: releaseId, formatType } = await context.params;
    loggers.s3.info(`[upload-proxy] START ${formatType} for release=${releaseId}`);

    // Step 2: Validate format type
    if (!VALID_FORMAT_TYPES.includes(formatType as DigitalFormatType)) {
      loggers.s3.warn(`[upload-proxy] Invalid format type: ${formatType}`);
      return NextResponse.json(
        { success: false, error: 'INVALID_FORMAT', message: 'Invalid digital format type.' },
        { status: 400 }
      );
    }

    // Step 3: Read and validate file metadata from request headers
    const metadata = parseUploadMetadata(request, formatType as DigitalFormatType);
    if (!metadata.ok) return metadata.response;
    const { fileName, fileSize, mimeType, trackNumber } = metadata;

    // Step 4: Validate file info and request body
    const fileCheck = validateUploadRequest({
      request,
      formatType: formatType as DigitalFormatType,
      fileName,
      fileSize,
      mimeType,
    });
    if (!fileCheck.ok) return fileCheck.response;

    // Step 5: Resolve and validate the base URL for audio comment metadata
    const baseUrlResult = resolveValidatedBaseUrl();
    if (!baseUrlResult.ok) return baseUrlResult.response;
    const validatedBaseUrl = baseUrlResult.url;

    // Step 7: Build S3 key and content type
    const s3Key = buildUploadS3Key({
      releaseId,
      formatType: formatType as DigitalFormatType,
      fileName,
      trackNumber,
    });
    const contentType = mimeType || getDefaultMimeType(formatType as DigitalFormatType);

    // Step 8: Stream request body to temp file, then upload to S3
    const fileExtension = extname(fileName).toLowerCase();
    const tempFilePath = join(tmpdir(), `upload-${randomUUID()}${fileExtension}`);

    try {
      // Write incoming stream to a temp file
      const nodeStream = Readable.fromWeb(request.body as NodeReadableStream);
      await pipeline(nodeStream, createWriteStream(tempFilePath));

      // Write comment tag if the format supports metadata (WAV does not)
      if (supportsComment(tempFilePath)) {
        await writeComment(tempFilePath, `Visit ${validatedBaseUrl}`);
      }

      const fileStat = await stat(tempFilePath);
      const actualFileSize = fileStat.size;

      // Upload processed file to S3
      await uploadTempFileToS3({
        tempFilePath,
        s3Key,
        contentType,
        formatType: formatType as DigitalFormatType,
        actualFileSize,
        startTime,
      });

      return NextResponse.json({ success: true, s3Key, contentType, trackNumber }, { status: 200 });
    } finally {
      await cleanupTempFile(tempFilePath);
    }
  } catch (error) {
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    loggers.s3.error(`[upload-proxy] FAILED after ${elapsed}s`, error);
    return NextResponse.json(
      {
        success: false,
        error: 'INTERNAL_ERROR',
        message: 'Upload failed. Please try again.',
      },
      { status: 500 }
    );
  }
});
