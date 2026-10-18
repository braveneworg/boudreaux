/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { NextResponse } from 'next/server';

import { VALID_FORMAT_TYPES } from '@/lib/constants/digital-formats';
import type { DigitalFormatType } from '@/lib/constants/digital-formats';
import { withAdmin } from '@/lib/decorators/with-auth';
import { formatUpload } from '@/lib/services/format-upload/format-upload';
import type { DataErrorCode } from '@/lib/types/domain/errors';
import { loggers } from '@/lib/utils/logger';

/** Allow long-running uploads (5 min) for large audio files (WAV up to 500 MB). */
export const maxDuration = 300;

/** The file headers, or the refusal they get. */
type UploadMetadata =
  | { ok: true; fileName: string; fileSize: number; mimeType: string }
  | { ok: false; response: NextResponse };

const refuse = (status: number, error: string, message: string): NextResponse =>
  NextResponse.json({ success: false, error, message }, { status });

/**
 * Reads the file-metadata headers, decodes the file name, checks the size,
 * and logs the "file=… size=…MB mime=…" line.
 */
const parseUploadMetadata = (request: Request, formatType: DigitalFormatType): UploadMetadata => {
  const rawFileName = request.headers.get('x-file-name');
  const fileSizeHeader = request.headers.get('x-file-size');
  const mimeType = request.headers.get('content-type') ?? '';

  if (!rawFileName || !fileSizeHeader) {
    loggers.s3.warn(`[upload-proxy] Missing metadata headers for ${formatType}`);
    return {
      ok: false,
      response: refuse(
        400,
        'MISSING_METADATA',
        'x-file-name and x-file-size headers are required.'
      ),
    };
  }

  // Decode URI-encoded file name (encoded client-side for safe HTTP header transport)
  const fileName = decodeURIComponent(rawFileName);

  const fileSize = parseInt(fileSizeHeader, 10);
  if (isNaN(fileSize) || fileSize <= 0) {
    return {
      ok: false,
      response: refuse(400, 'INVALID_SIZE', 'x-file-size must be a positive integer.'),
    };
  }

  loggers.s3.info(
    `[upload-proxy] ${formatType}: file="${fileName}" size=${(fileSize / 1024 / 1024).toFixed(1)}MB mime=${mimeType || '(empty)'}`
  );

  return { ok: true, fileName, fileSize, mimeType };
};

/** The copy of an internal error, the module's and the route's own alike. */
const UPLOAD_FAILED = 'Upload failed. Please try again.';

/** How the module's refusals answer over HTTP; anything else is an internal error. */
const REFUSAL_BY_CODE = new Map<DataErrorCode, { status: number; error: string }>([
  ['INVALID_INPUT', { status: 400, error: 'VALIDATION_FAILED' }],
  ['UNAVAILABLE', { status: 500, error: 'SERVER_CONFIGURATION_ERROR' }],
]);

/**
 * PUT /api/releases/[id]/upload/[formatType]
 *
 * Proxy upload endpoint: takes one file from the browser and hands it, with
 * the request's abort signal, to the format upload module, which checks it,
 * tags it, and stores it. The client passes the returned `s3Key` to
 * `confirmFormatUploadAction`.
 */
export const PUT = withAdmin<{ id: string; formatType: string }>(async (request, context) => {
  try {
    const { id: releaseId, formatType } = await context.params;
    loggers.s3.info(`[upload-proxy] START ${formatType} for release=${releaseId}`);

    if (!VALID_FORMAT_TYPES.includes(formatType as DigitalFormatType)) {
      loggers.s3.warn(`[upload-proxy] Invalid format type: ${formatType}`);
      return refuse(400, 'INVALID_FORMAT', 'Invalid digital format type.');
    }

    const metadata = parseUploadMetadata(request, formatType as DigitalFormatType);
    if (!metadata.ok) return metadata.response;

    if (!request.body) {
      loggers.s3.warn(`[upload-proxy] Empty request body for ${formatType}`);
      return refuse(400, 'NO_BODY', 'Request body is empty.');
    }

    const received = await formatUpload.receive({
      releaseId,
      formatType: formatType as DigitalFormatType,
      fileName: metadata.fileName,
      fileSize: metadata.fileSize,
      mimeType: metadata.mimeType,
      body: request.body,
      signal: request.signal,
    });

    if (!received.success) {
      const { status, error } = REFUSAL_BY_CODE.get(received.code) ?? {
        status: 500,
        error: 'INTERNAL_ERROR',
      };
      return refuse(status, error, received.error);
    }

    return NextResponse.json({ success: true, ...received.data }, { status: 200 });
  } catch (error) {
    loggers.s3.error('[upload-proxy] FAILED', error);
    return refuse(500, 'INTERNAL_ERROR', UPLOAD_FAILED);
  }
});
