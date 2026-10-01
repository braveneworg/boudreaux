/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { NextResponse } from 'next/server';

import { DOWNLOAD_LIMIT, downloadLimiter } from '@/lib/config/rate-limit-tiers';
import { isValidFormatType } from '@/lib/constants/digital-formats';
import { withAuth } from '@/lib/decorators/with-auth';
import { withLogging } from '@/lib/decorators/with-logging';
import { extractClientIp } from '@/lib/decorators/with-rate-limit';
import { downloadGate, type GateFormatRecord } from '@/lib/services/download-gate/download-gate';
import type { Deliverable } from '@/lib/services/download-gate/types';
import { downloadRefusal } from '@/lib/utils/download-outcome-response';
import { loggers } from '@/lib/utils/logger';
import { generatePresignedDownloadUrl } from '@/lib/utils/s3-client';
import { isValidObjectId } from '@/lib/utils/validation/object-id';

/**
 * GET /api/releases/[id]/download/[formatType]
 *
 * One digital format as a presigned URL (24h). An adapter over
 * `DownloadGate.download` (ADR-0018): the gate decides and charges; this
 * route resolves the subject, produces the URL, and maps the outcome. Only
 * legacy single-file formats have one URL to give — a multi-track format is
 * the bundle route's job.
 */

const PRESIGNED_URL_TTL_MS = 24 * 60 * 60 * 1000;

const logger = loggers.media;

// Rate limiting — skipped in E2E test mode to avoid 429s during test runs,
// matching the `withRateLimit` decorator on the sibling free-status route.
const enforceDownloadRateLimit = async (ip: string): Promise<NextResponse | null> => {
  if (process.env.E2E_MODE === 'true') {
    return null;
  }
  try {
    await downloadLimiter.check(DOWNLOAD_LIMIT, ip);
    return null;
  } catch {
    return NextResponse.json(
      {
        success: false,
        error: 'RATE_LIMITED',
        message: 'Too many requests. Please try again later.',
      },
      { status: 429 }
    );
  }
};

class MultiTrackFormatError extends Error {
  constructor() {
    super('A multi-track format has no single file to presign');
    this.name = 'MultiTrackFormatError';
  }
}

/** The deliverable for a legacy single-file format: its presigned URL. */
const produceSingleFileUrl = async ([record]: GateFormatRecord[]): Promise<Deliverable> => {
  if (!record?.s3Key || !record.fileName) {
    throw new MultiTrackFormatError();
  }
  return {
    kind: 'url',
    downloadUrl: await generatePresignedDownloadUrl(record.s3Key, record.fileName),
    fileName: record.fileName,
  };
};

export const GET = withLogging<{ id: string; formatType: string }>('DOWNLOADS')(
  withAuth<{ id: string; formatType: string }>(async (request, context, session) => {
    try {
      const rateLimited = await enforceDownloadRateLimit(extractClientIp(request));
      if (rateLimited) return rateLimited;

      const { id: releaseId, formatType } = await context.params;
      if (!isValidObjectId(releaseId) || !isValidFormatType(formatType)) {
        return NextResponse.json(
          { success: false, error: 'INVALID_REQUEST', message: 'Invalid release or format.' },
          { status: 400 }
        );
      }

      const outcome = await downloadGate.download(
        { subject: { kind: 'user', userId: session.user.id }, releaseId, formats: [formatType] },
        (_grant, records) => produceSingleFileUrl(records),
        {
          ipAddress: request.headers.get('x-forwarded-for') ?? 'unknown',
          userAgent: request.headers.get('user-agent') || 'unknown',
        }
      );
      if (!outcome.ok) {
        const { status, body } = downloadRefusal(outcome);
        return NextResponse.json(body, { status });
      }
      if (outcome.deliverable.kind !== 'url') {
        throw new Error('single-format route produced a non-URL deliverable');
      }
      return NextResponse.json({
        success: true,
        downloadUrl: outcome.deliverable.downloadUrl,
        expiresAt: new Date(Date.now() + PRESIGNED_URL_TTL_MS).toISOString(),
        fileName: outcome.deliverable.fileName,
      });
    } catch (error) {
      if (error instanceof MultiTrackFormatError) {
        return NextResponse.json(
          {
            success: false,
            error: 'MULTI_TRACK',
            message: 'This format has several files; download it as a bundle.',
          },
          { status: 400 }
        );
      }
      logger.error('Download route error', error);
      return NextResponse.json(
        { success: false, error: 'INTERNAL_ERROR', message: 'An unexpected error occurred.' },
        { status: 500 }
      );
    }
  })
);
