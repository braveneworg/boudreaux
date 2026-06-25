/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { NextResponse } from 'next/server';

import { DOWNLOAD_LIMIT, downloadLimiter } from '@/lib/config/rate-limit-tiers';
import { VALID_FORMAT_TYPES, type DigitalFormatType } from '@/lib/constants/digital-formats';
import { withAuth } from '@/lib/decorators/with-auth';
import { extractClientIp } from '@/lib/decorators/with-rate-limit';
import { DownloadEventRepository } from '@/lib/repositories/download-event-repository';
import { PurchaseRepository } from '@/lib/repositories/purchase-repository';
import { PurchaseService } from '@/lib/services/purchase-service';
import { loggers } from '@/lib/utils/logger';
import { isValidObjectId } from '@/lib/utils/validation/object-id';

const NO_STORE_HEADERS = { 'Cache-Control': 'private, no-store' } as const;

interface ConfirmRequestBody {
  formats: string[];
}

type FormatsResult =
  | { ok: true; formats: DigitalFormatType[] }
  | { ok: false; response: NextResponse };

interface LogEventsArgs {
  repo: DownloadEventRepository;
  userId: string;
  releaseId: string;
  formats: DigitalFormatType[];
  ipAddress: string;
  userAgent: string;
}

/** Enforces the rate limit; returns a 429 response if exceeded, null if allowed. */
const applyRateLimit = async (ip: string): Promise<NextResponse | null> => {
  if (process.env.E2E_MODE === 'true') return null;
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
      { status: 429, headers: NO_STORE_HEADERS }
    );
  }
};

/**
 * Parses and validates the request body, returning a tagged result with
 * deduplicated valid DigitalFormatType values, or a 400 response on failure.
 */
const parseAndValidateFormats = async (request: Request): Promise<FormatsResult> => {
  let body: ConfirmRequestBody;
  try {
    body = (await request.json()) as ConfirmRequestBody;
  } catch {
    return {
      ok: false,
      response: NextResponse.json(
        { success: false, error: 'INVALID_BODY', message: 'Invalid JSON body.' },
        { status: 400, headers: NO_STORE_HEADERS }
      ),
    };
  }

  if (!Array.isArray(body.formats) || body.formats.length === 0) {
    return {
      ok: false,
      response: NextResponse.json(
        {
          success: false,
          error: 'INVALID_FORMATS',
          message: 'At least one format is required.',
        },
        { status: 400, headers: NO_STORE_HEADERS }
      ),
    };
  }

  const validFormats = Array.from(
    new Set(
      body.formats.filter((f): f is DigitalFormatType =>
        VALID_FORMAT_TYPES.includes(f as DigitalFormatType)
      )
    )
  );

  if (validFormats.length === 0) {
    return {
      ok: false,
      response: NextResponse.json(
        {
          success: false,
          error: 'INVALID_FORMATS',
          message: 'No valid format types provided.',
        },
        { status: 400, headers: NO_STORE_HEADERS }
      ),
    };
  }

  return { ok: true, formats: validFormats };
};

/** Logs one download event per format concurrently. */
const logDownloadEvents = async ({
  repo,
  userId,
  releaseId,
  formats,
  ipAddress,
  userAgent,
}: LogEventsArgs): Promise<void> => {
  await Promise.all(
    formats.map((formatType) =>
      repo.logDownloadEvent({
        userId,
        releaseId,
        formatType,
        success: true,
        ipAddress,
        userAgent,
      })
    )
  );
};

/**
 * POST /api/releases/[id]/download/confirm
 *
 * Called by the client after all per-format downloads have been triggered.
 * Increments the download count once (not per format) and logs a download
 * event for each format.
 *
 * Body: { formats: ["FLAC", "WAV"] }
 */
export const POST = withAuth<{ id: string }>(async (request, context, session) => {
  try {
    // Rate limiting — skipped in E2E test mode to avoid 429s during test runs,
    // matching the `withRateLimit` decorator on the sibling free-status route.
    const ip = extractClientIp(request);
    const rateLimitResponse = await applyRateLimit(ip);
    if (rateLimitResponse) return rateLimitResponse;

    const userId = session.user.id;
    const { id: releaseId } = await context.params;

    if (!isValidObjectId(releaseId)) {
      return NextResponse.json(
        { success: false, error: 'INVALID_ID', message: 'Invalid release ID.' },
        { status: 400, headers: NO_STORE_HEADERS }
      );
    }

    const formatsResult = await parseAndValidateFormats(request);
    if (!formatsResult.ok) return formatsResult.response;
    const { formats: validFormats } = formatsResult;

    const access = await PurchaseService.getDownloadAccess({ kind: 'user', userId }, releaseId);

    if (!access.allowed) {
      const isPurchaseRequired = access.reason === 'no_purchase';
      return NextResponse.json(
        {
          success: false,
          error: isPurchaseRequired ? 'PURCHASE_REQUIRED' : 'DOWNLOAD_LIMIT',
          message: isPurchaseRequired
            ? 'Purchase required to download.'
            : 'Download limit reached.',
        },
        { status: 403, headers: NO_STORE_HEADERS }
      );
    }

    await PurchaseRepository.upsertDownloadCount(userId, releaseId);

    const downloadEventRepo = new DownloadEventRepository();
    const ipAddress = extractClientIp(request) ?? 'unknown';
    const userAgent = request.headers.get('user-agent') ?? 'unknown';

    await logDownloadEvents({
      repo: downloadEventRepo,
      userId,
      releaseId,
      formats: validFormats,
      ipAddress,
      userAgent,
    });

    return NextResponse.json({ success: true }, { headers: NO_STORE_HEADERS });
  } catch (error) {
    loggers.downloads.error('Download confirm error', error);

    return NextResponse.json(
      { success: false, error: 'INTERNAL_ERROR', message: 'An unexpected error occurred.' },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }
});
