/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

import { PUBLIC_LIMIT, publicLimiter } from '@/lib/config/rate-limit-tiers';
import { withAdmin } from '@/lib/decorators/with-auth';
import { withRateLimit } from '@/lib/decorators/with-rate-limit';
import { FeaturedArtistsService } from '@/lib/services/featured-artists-service';
import { httpStatusForCode } from '@/lib/utils/http-status-for-code';
import { loggers } from '@/lib/utils/logger';
import { serializeForResponse } from '@/lib/utils/serialize-for-response';
import { isValidObjectId } from '@/lib/utils/validation/object-id';

/**
 * GET /api/featured-artists/[id]
 * Get a single featured artist by ID
 */
export const GET = withRateLimit<{ id: string }>(
  publicLimiter,
  PUBLIC_LIMIT
)(async (_request: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
  try {
    const { id } = await params;

    if (!isValidObjectId(id)) {
      return NextResponse.json({ error: 'Invalid featured artist ID' }, { status: 400 });
    }

    const result = await FeaturedArtistsService.getFeaturedArtistById(id);

    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: httpStatusForCode(result.code) });
    }

    return NextResponse.json(serializeForResponse(result.data), {
      headers: { 'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300' },
    });
  } catch (error) {
    loggers.media.error('FeaturedArtist GET by ID error', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
});

/**
 * DELETE /api/featured-artists/[id]
 * Delete a featured artist by ID
 */
export const DELETE = withAdmin(
  async (_request: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
    try {
      const { id } = await params;

      const result = await FeaturedArtistsService.hardDeleteFeaturedArtist(id);

      if (!result.success) {
        return NextResponse.json(
          { error: result.error },
          { status: httpStatusForCode(result.code) }
        );
      }

      return NextResponse.json({ message: 'Featured artist deleted successfully' });
    } catch (error) {
      loggers.media.error('FeaturedArtist DELETE error', error);
      return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
  }
);
