/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

import { PUBLIC_LIMIT, publicLimiter } from '@/lib/config/rate-limit-tiers';
import { withRateLimit } from '@/lib/decorators/with-rate-limit';
import { ReleaseService } from '@/lib/services/release-service';
import { isValidObjectId } from '@/lib/utils/validation/object-id';

export const dynamic = 'force-dynamic';

/**
 * GET /api/releases/[id]/related?artistId=...
 * Returns other published releases by the same artist, excluding the current release.
 */
export const GET = withRateLimit<{ id: string }>(
  publicLimiter,
  PUBLIC_LIMIT
)(async (request: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
  try {
    const { id } = await params;

    if (!isValidObjectId(id)) {
      return NextResponse.json({ error: 'Invalid release ID' }, { status: 400 });
    }

    const artistId = request.nextUrl.searchParams.get('artistId');

    if (!artistId) {
      return NextResponse.json(
        { releases: [] },
        {
          headers: { 'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300' },
        }
      );
    }

    const result = await ReleaseService.getArtistOtherReleases(artistId, id);

    if (!result.success) {
      return NextResponse.json(
        { error: result.error },
        { status: result.error === 'Database unavailable' ? 503 : 500 }
      );
    }

    return NextResponse.json(
      { releases: result.data },
      {
        headers: { 'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300' },
      }
    );
  } catch (error) {
    console.error('Related releases GET error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
});
