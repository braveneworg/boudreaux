/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import 'server-only';

import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

import { DOWNLOAD_LIMIT, downloadLimiter } from '@/lib/config/rate-limit-tiers';
import { FREE_FORMAT_TYPES, type FreeFormatType } from '@/lib/constants/digital-formats';
import { extractClientIp, withRateLimit } from '@/lib/decorators/with-rate-limit';
import { ReleaseDigitalFormatRepository } from '@/lib/repositories/release-digital-format-repository';
import {
  CapReachedError,
  freeDownloadQuotaService,
  FREE_DOWNLOAD_CAP,
} from '@/lib/services/free-download-quota-service';
import { ReleaseService } from '@/lib/services/release-service';
import { readGuestVisitorId, setGuestVisitorIdCookie } from '@/lib/utils/guest-visitor-id';
import { isValidObjectId } from '@/lib/utils/validation/object-id';
import { computeFingerprintHash } from '@/lib/utils/visitor-fingerprint';
import type { FreeStatusResponse } from '@/lib/validation/bundle-download-schema';

/**
 * GET /api/releases/[id]/download/free-status
 *
 * Returns the free-download cap status for the current visitor and the
 * subset of {@link FREE_FORMAT_TYPES} that are actually published for the
 * release. Issues `boudreaux_visitor_id` cookie if absent or invalid so
 * subsequent calls share the same anonymous identity.
 *
 * @see specs/007-free-digital-downloads/contracts/bundle-endpoint.md §1
 */
export const dynamic = 'force-dynamic';

const NO_STORE_HEADERS = { 'Cache-Control': 'no-store' } as const;

export const GET = withRateLimit<{ id: string }>(
  downloadLimiter,
  DOWNLOAD_LIMIT
)(async (request: NextRequest, context) => {
  const { id: releaseId } = await context.params;

  if (!isValidObjectId(releaseId)) {
    return NextResponse.json(
      { error: 'invalid_release_id' },
      { status: 400, headers: NO_STORE_HEADERS }
    );
  }

  const exists = await ReleaseService.existsById(releaseId);
  if (!exists) {
    return NextResponse.json({ error: 'not_found' }, { status: 404, headers: NO_STORE_HEADERS });
  }

  // Resolve composite identity (cookie + fingerprint).
  const cookieValue = await readGuestVisitorId();
  const fingerprintHash = computeFingerprintHash({
    userAgent: request.headers.get('user-agent'),
    acceptLanguage: request.headers.get('accept-language'),
    ip: extractClientIp(request),
  });

  const identity = await freeDownloadQuotaService.resolveVisitorIdentity({
    cookieValue,
    fingerprintHash,
  });

  if (identity.cookieReissue) {
    await setGuestVisitorIdCookie(identity.primaryVisitorId);
  }

  // Intersect FREE_FORMAT_TYPES with what's published for this release.
  const formatRepo = new ReleaseDigitalFormatRepository();
  const publishedFormats = await formatRepo.findAllByRelease(releaseId);
  const publishedSet = new Set(publishedFormats.map((f) => f.formatType));
  const availableFreeFormats: FreeFormatType[] = FREE_FORMAT_TYPES.filter((f) =>
    publishedSet.has(f)
  );

  if (availableFreeFormats.length === 0) {
    const body: FreeStatusResponse = {
      allowed: false,
      remaining: 0,
      windowSeconds: 86_400,
      resetsAtIso: null,
      blockedReason: 'no-free-formats',
      availableFreeFormats: [],
    };
    return NextResponse.json(body, { headers: NO_STORE_HEADERS });
  }

  // Cap query (anonymous-guest path only — auth users not relevant here yet).
  try {
    const status = await freeDownloadQuotaService.assertFreeDownloadAllowed({
      subject: { kind: 'guest', visitorId: identity.primaryVisitorId },
      visitorIds: identity.allVisitorIds,
      releaseId,
    });
    const body: FreeStatusResponse = {
      allowed: true,
      remaining: status.remaining,
      windowSeconds: 86_400,
      resetsAtIso: status.resetsAt?.toISOString() ?? null,
      blockedReason: null,
      availableFreeFormats,
    };
    return NextResponse.json(body, { headers: NO_STORE_HEADERS });
  } catch (err) {
    if (err instanceof CapReachedError) {
      const body: FreeStatusResponse = {
        allowed: false,
        remaining: 0,
        windowSeconds: 86_400,
        resetsAtIso: err.resetsAt.toISOString(),
        blockedReason: 'cap-reached',
        availableFreeFormats,
      };
      return NextResponse.json(body, { headers: NO_STORE_HEADERS });
    }
    throw err;
  }
});

// Re-export for explicit reference in tests.
export { FREE_DOWNLOAD_CAP };
