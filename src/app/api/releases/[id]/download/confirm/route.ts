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
import { isValidObjectId } from '@/lib/utils/validation/object-id';

const NO_STORE_HEADERS = { 'Cache-Control': 'private, no-store' } as const;

interface ConfirmRequestBody {
  formats: string[];
}

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
    if (process.env.E2E_MODE !== 'true') {
      try {
        await downloadLimiter.check(DOWNLOAD_LIMIT, ip);
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
    }

    const userId = session.user.id;
    const { id: releaseId } = await context.params;

    // Validate release ID
    if (!isValidObjectId(releaseId)) {
      return NextResponse.json(
        { success: false, error: 'INVALID_ID', message: 'Invalid release ID.' },
        { status: 400, headers: NO_STORE_HEADERS }
      );
    }

    // Step 2: Parse and validate request body
    let body: ConfirmRequestBody;
    try {
      body = (await request.json()) as ConfirmRequestBody;
    } catch {
      return NextResponse.json(
        { success: false, error: 'INVALID_BODY', message: 'Invalid JSON body.' },
        { status: 400, headers: NO_STORE_HEADERS }
      );
    }

    if (!Array.isArray(body.formats) || body.formats.length === 0) {
      return NextResponse.json(
        {
          success: false,
          error: 'INVALID_FORMATS',
          message: 'At least one format is required.',
        },
        { status: 400, headers: NO_STORE_HEADERS }
      );
    }

    const validFormats = Array.from(
      new Set(
        body.formats.filter((f): f is DigitalFormatType =>
          VALID_FORMAT_TYPES.includes(f as DigitalFormatType)
        )
      )
    );

    if (validFormats.length === 0) {
      return NextResponse.json(
        {
          success: false,
          error: 'INVALID_FORMATS',
          message: 'No valid format types provided.',
        },
        { status: 400, headers: NO_STORE_HEADERS }
      );
    }

    // Step 3: Verify purchase exists
    const access = await PurchaseService.getDownloadAccess({ kind: 'user', userId }, releaseId);

    if (!access.allowed) {
      return NextResponse.json(
        {
          success: false,
          error: access.reason === 'no_purchase' ? 'PURCHASE_REQUIRED' : 'DOWNLOAD_LIMIT',
          message:
            access.reason === 'no_purchase'
              ? 'Purchase required to download.'
              : 'Download limit reached.',
        },
        { status: 403, headers: NO_STORE_HEADERS }
      );
    }

    // Step 4: Increment download count once (not per format)
    await PurchaseRepository.upsertDownloadCount(userId, releaseId);

    // Step 5: Log download events per format
    const downloadEventRepo = new DownloadEventRepository();
    const ipAddress = extractClientIp(request) ?? 'unknown';
    const userAgent = request.headers.get('user-agent') ?? 'unknown';

    await Promise.all(
      validFormats.map((formatType) =>
        downloadEventRepo.logDownloadEvent({
          userId,
          releaseId,
          formatType,
          success: true,
          ipAddress,
          userAgent,
        })
      )
    );

    return NextResponse.json({ success: true }, { headers: NO_STORE_HEADERS });
  } catch (error) {
    console.error('Download confirm error', { error });

    return NextResponse.json(
      { success: false, error: 'INTERNAL_ERROR', message: 'An unexpected error occurred.' },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }
});
