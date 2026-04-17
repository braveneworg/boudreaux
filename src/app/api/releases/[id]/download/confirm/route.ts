/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import type { NextRequest } from 'next/server';

import { getToken } from 'next-auth/jwt';

import { DOWNLOAD_LIMIT, downloadLimiter } from '@/lib/config/rate-limit-tiers';
import { VALID_FORMAT_TYPES, type DigitalFormatType } from '@/lib/constants/digital-formats';
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
export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
): Promise<Response> {
  try {
    // Rate limiting
    const ip = extractClientIp(request);
    try {
      await downloadLimiter.check(DOWNLOAD_LIMIT, ip);
    } catch {
      return Response.json(
        {
          success: false,
          error: 'RATE_LIMITED',
          message: 'Too many requests. Please try again later.',
        },
        { status: 429, headers: NO_STORE_HEADERS }
      );
    }

    // Step 1: Authentication
    const secureCookie = process.env.NODE_ENV === 'production' && process.env.E2E_MODE !== 'true';
    const token = await getToken({
      req: request,
      secret: process.env.AUTH_SECRET,
      cookieName: secureCookie ? '__Secure-next-auth.session-token' : 'next-auth.session-token',
      secureCookie,
    });

    if (!token?.sub) {
      return Response.json(
        { success: false, error: 'UNAUTHORIZED', message: 'You must be logged in.' },
        { status: 401, headers: NO_STORE_HEADERS }
      );
    }

    const userId = token.sub;
    const { id: releaseId } = await context.params;

    // Validate release ID
    if (!isValidObjectId(releaseId)) {
      return Response.json(
        { success: false, error: 'INVALID_ID', message: 'Invalid release ID.' },
        { status: 400, headers: NO_STORE_HEADERS }
      );
    }

    // Step 2: Parse and validate request body
    let body: ConfirmRequestBody;
    try {
      body = (await request.json()) as ConfirmRequestBody;
    } catch {
      return Response.json(
        { success: false, error: 'INVALID_BODY', message: 'Invalid JSON body.' },
        { status: 400, headers: NO_STORE_HEADERS }
      );
    }

    if (!Array.isArray(body.formats) || body.formats.length === 0) {
      return Response.json(
        {
          success: false,
          error: 'INVALID_FORMATS',
          message: 'At least one format is required.',
        },
        { status: 400, headers: NO_STORE_HEADERS }
      );
    }

    const validFormats = body.formats.filter((f): f is DigitalFormatType =>
      VALID_FORMAT_TYPES.includes(f as DigitalFormatType)
    );

    if (validFormats.length === 0) {
      return Response.json(
        {
          success: false,
          error: 'INVALID_FORMATS',
          message: 'No valid format types provided.',
        },
        { status: 400, headers: NO_STORE_HEADERS }
      );
    }

    // Step 3: Verify purchase exists
    const access = await PurchaseService.getDownloadAccess(userId, releaseId);

    if (!access.allowed) {
      return Response.json(
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
    const ipAddress = request.headers.get('x-forwarded-for') ?? 'unknown';
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

    return Response.json({ success: true }, { headers: NO_STORE_HEADERS });
  } catch (error) {
    console.error('Download confirm error', { error });

    return Response.json(
      { success: false, error: 'INTERNAL_ERROR', message: 'An unexpected error occurred.' },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }
}
