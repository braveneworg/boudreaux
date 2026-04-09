/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { randomUUID } from 'node:crypto';
import { createReadStream, createWriteStream } from 'node:fs';
import { stat, unlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';

import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

import { Upload } from '@aws-sdk/lib-storage';

import { VALID_FORMAT_TYPES, getDefaultMimeType } from '@/lib/constants/digital-formats';
import type { DigitalFormatType } from '@/lib/constants/digital-formats';
import { AudioTagStripService } from '@/lib/services/audio-tag-strip-service';
import { UploadService } from '@/lib/services/upload-service';
import { getS3BucketName, getS3Client } from '@/lib/utils/s3-client';

import { auth } from '../../../../../../../auth';

import type { ReadableStream as NodeReadableStream } from 'node:stream/web';

/** Allow long-running uploads (5 min) for large audio files (WAV up to 500 MB). */
export const maxDuration = 300;

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
 * 5. Strip Comment metadata tag from the audio file (best-effort, executed before upload)
 * 6. Upload processed file to S3 via multipart Upload (no CORS needed)
 * 7. Clean up temp file
 * 8. Return { s3Key, contentType } for the client to pass to confirmDigitalFormatUploadAction
 */
export async function PUT(
  request: NextRequest,
  context: { params: Promise<{ id: string; formatType: string }> }
): Promise<NextResponse> {
  const startTime = Date.now();

  try {
    // Step 1: Admin auth check via session
    const session = await auth();

    if (!session?.user?.role || session.user.role !== 'admin') {
      console.warn('[upload-proxy] Unauthorized upload attempt');
      return NextResponse.json(
        { success: false, error: 'UNAUTHORIZED', message: 'Admin access required.' },
        { status: 401 }
      );
    }

    const { id: releaseId, formatType } = await context.params;
    console.info(`[upload-proxy] START ${formatType} for release=${releaseId}`);

    // Step 2: Validate format type
    if (!VALID_FORMAT_TYPES.includes(formatType as DigitalFormatType)) {
      console.warn(`[upload-proxy] Invalid format type: ${formatType}`);
      return NextResponse.json(
        { success: false, error: 'INVALID_FORMAT', message: 'Invalid digital format type.' },
        { status: 400 }
      );
    }

    // Step 3: Read file metadata from request headers
    const rawFileName = request.headers.get('x-file-name');
    const fileSizeHeader = request.headers.get('x-file-size');
    const mimeType = request.headers.get('content-type') ?? '';
    const trackNumberHeader = request.headers.get('x-track-number');

    if (!rawFileName || !fileSizeHeader) {
      console.warn(`[upload-proxy] Missing metadata headers for ${formatType}`);
      return NextResponse.json(
        {
          success: false,
          error: 'MISSING_METADATA',
          message: 'x-file-name and x-file-size headers are required.',
        },
        { status: 400 }
      );
    }

    // Decode URI-encoded file name (encoded client-side for safe HTTP header transport)
    const fileName = decodeURIComponent(rawFileName);

    const fileSize = parseInt(fileSizeHeader, 10);
    if (isNaN(fileSize) || fileSize <= 0) {
      return NextResponse.json(
        {
          success: false,
          error: 'INVALID_SIZE',
          message: 'x-file-size must be a positive integer.',
        },
        { status: 400 }
      );
    }

    console.info(
      `[upload-proxy] ${formatType}: file="${fileName}" size=${(fileSize / 1024 / 1024).toFixed(1)}MB mime=${mimeType || '(empty)'}`
    );

    // Step 4: Validate file against format-specific rules
    const uploadService = new UploadService();
    const validation = uploadService.validateFileInfo({
      formatType: formatType as DigitalFormatType,
      fileName,
      fileSize,
      mimeType,
    });

    if (!validation.valid) {
      console.warn(`[upload-proxy] Validation failed for ${formatType}: ${validation.error}`);
      return NextResponse.json(
        { success: false, error: 'VALIDATION_FAILED', message: validation.error },
        { status: 400 }
      );
    }

    // Step 5: Build S3 key (mirrors UploadService.generatePresignedUploadUrl logic)
    const timestamp = Date.now();
    const sanitizedFileName = fileName.replace(/[^a-zA-Z0-9.-]/g, '-');
    const trackNumber = trackNumberHeader ? parseInt(trackNumberHeader, 10) : undefined;
    const trackPrefix = trackNumber != null ? `tracks/${trackNumber}-` : '';
    const s3Key = `releases/${releaseId}/digital-formats/${formatType}/${trackPrefix}${timestamp}-${sanitizedFileName}`;
    const contentType = mimeType || getDefaultMimeType(formatType as DigitalFormatType);

    // Step 6: Validate request body exists
    if (!request.body) {
      console.warn(`[upload-proxy] Empty request body for ${formatType}`);
      return NextResponse.json(
        { success: false, error: 'NO_BODY', message: 'Request body is empty.' },
        { status: 400 }
      );
    }

    // Step 7: Stream request body to temp file, strip comment tag, then upload to S3
    const tempFilePath = join(tmpdir(), `upload-${randomUUID()}.tmp`);

    try {
      // Write incoming stream to a temp file
      const nodeStream = Readable.fromWeb(request.body as NodeReadableStream);
      await pipeline(nodeStream, createWriteStream(tempFilePath));

      console.info(`[upload-proxy] ${formatType}: saved to temp file, stripping comment tag`);

      // Strip comment metadata tag (best-effort — upload proceeds even on failure)
      const stripResult = await AudioTagStripService.stripCommentTag(tempFilePath);
      if (stripResult.success && stripResult.data.commentFound) {
        console.info(`[upload-proxy] ${formatType}: stripped comment tag`);
      } else if (!stripResult.success) {
        console.warn(
          `[upload-proxy] ${formatType}: comment strip failed (${stripResult.error}) — uploading original file`
        );
      }

      // Read actual file size from disk (may differ after tag modification)
      const fileStat = await stat(tempFilePath);
      const actualFileSize = fileStat.size;

      // Upload processed file to S3
      const s3Client = getS3Client();
      const bucketName = getS3BucketName();

      console.info(`[upload-proxy] ${formatType}: starting S3 multipart upload to key=${s3Key}`);

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
        console.info(
          `[upload-proxy] ${formatType}: progress ${pct}% (${(loaded / 1024 / 1024).toFixed(1)}MB / ${(actualFileSize / 1024 / 1024).toFixed(1)}MB)`
        );
      });

      await upload.done();

      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
      console.info(`[upload-proxy] ${formatType}: COMPLETE in ${elapsed}s — s3Key=${s3Key}`);

      return NextResponse.json({ success: true, s3Key, contentType, trackNumber }, { status: 200 });
    } finally {
      // Always clean up temp file
      try {
        await unlink(tempFilePath);
      } catch (error) {
        console.warn('[upload-proxy] Failed to clean up temp file', {
          tempFilePath,
          error:
            error instanceof Error
              ? { message: error.message, name: error.name, stack: error.stack }
              : error,
        });
      }
    }
  } catch (error) {
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.error(
      `[upload-proxy] FAILED after ${elapsed}s:`,
      error instanceof Error
        ? { message: error.message, name: error.name, stack: error.stack }
        : error
    );
    return NextResponse.json(
      {
        success: false,
        error: 'INTERNAL_ERROR',
        message: 'Upload failed. Please try again.',
      },
      { status: 500 }
    );
  }
}
