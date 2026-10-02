/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import 'server-only';

import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

import { PUBLIC_LIMIT, publicLimiter } from '@/lib/config/rate-limit-tiers';
import { withAdmin } from '@/lib/decorators/with-auth';
import { withRateLimit } from '@/lib/decorators/with-rate-limit';
import { ReleaseService } from '@/lib/services/release-service';
import { attachStreamUrls } from '@/lib/utils/attach-stream-urls';
import { httpStatusForCode } from '@/lib/utils/http-status-for-code';
import { loggers } from '@/lib/utils/logger';
import { serializeForResponse } from '@/lib/utils/serialize-for-response';
import { isValidObjectId } from '@/lib/utils/validation/object-id';

export const dynamic = 'force-dynamic';

type ReleaseRouteContext = { params: Promise<{ id: string }> };

const PUBLIC_CACHE_CONTROL = 'public, s-maxage=60, stale-while-revalidate=300';

/**
 * The admin by-id read (no `withTracks`): the full release graph the edit form
 * loads — unpublished releases included, and every credited artist's full row
 * (contact PII, notes, job tokens). Admin only and never shared-cached (#765).
 */
const getAdminRelease = withAdmin(
  async (_request: NextRequest, { params }: ReleaseRouteContext) => {
    const { id } = await params;
    const result = await ReleaseService.getReleaseById(id);

    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: httpStatusForCode(result.code) });
    }

    return NextResponse.json(serializeForResponse(result.data), {
      headers: { 'Cache-Control': 'private, no-store' },
    });
  }
);

/** The public by-id read (`withTracks=true`): the published, narrow-projected player payload. */
const getPublishedRelease = async (id: string): Promise<NextResponse> => {
  const result = await ReleaseService.getReleaseWithTracks(id);

  if (!result.success) {
    return NextResponse.json({ error: result.error }, { status: httpStatusForCode(result.code) });
  }

  return NextResponse.json(attachStreamUrls(serializeForResponse(result.data)), {
    headers: { 'Cache-Control': PUBLIC_CACHE_CONTROL },
  });
};

/**
 * GET /api/releases/[id]
 * Get a single release by ID.
 *
 * Query params:
 *   withTracks – When "true", returns the public published release with tracks
 *                via `getReleaseWithTracks()`. Without it the full admin graph
 *                is returned via `getReleaseById()`, which requires the admin
 *                role.
 */
export const GET = withRateLimit<{ id: string }>(
  publicLimiter,
  PUBLIC_LIMIT
)(async (request: NextRequest, context: ReleaseRouteContext) => {
  try {
    const { id } = await context.params;

    if (!isValidObjectId(id)) {
      return NextResponse.json({ error: 'Invalid release ID' }, { status: 400 });
    }

    return request.nextUrl.searchParams.get('withTracks') === 'true'
      ? await getPublishedRelease(id)
      : await getAdminRelease(request, context);
  } catch (error) {
    loggers.media.error('Release GET by ID error', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
});
