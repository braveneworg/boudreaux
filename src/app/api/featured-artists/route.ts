/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

import { auth } from '@/auth';
import { PUBLIC_LIMIT, publicLimiter } from '@/lib/config/rate-limit-tiers';
import { withAdmin } from '@/lib/decorators/with-auth';
import { withRateLimit } from '@/lib/decorators/with-rate-limit';
import { FeaturedArtistsService } from '@/lib/services/featured-artists-service';
import { computeNextSkip } from '@/lib/types/pagination';
import { attachStreamUrls } from '@/lib/utils/attach-stream-urls';
import { loggers } from '@/lib/utils/logger';
import { serializeForResponse } from '@/lib/utils/serialize-for-response';
import { validateBody } from '@/lib/utils/validate-request';
import { createFeaturedArtistSchema } from '@/lib/validation/create-featured-artist-schema';

import type { Prisma } from '@prisma/client';

export const dynamic = 'force-dynamic';

const DEFAULT_TAKE = 24;
const MAX_TAKE = 100;

/**
 * GET /api/featured-artists
 * Get all featured artists or search for featured artists.
 *
 * Query params:
 *   active  – When "true", returns only currently active (published, date-filtered) featured artists
 *             using `getFeaturedArtists()`. Otherwise returns admin listing via `getAllFeaturedArtists()`.
 *   limit   – Max items to return when active=true (default 10, max 100).
 *   skip, take, search – Pagination/search params for admin listing mode.
 */
export const GET = withRateLimit(
  publicLimiter,
  PUBLIC_LIMIT
)(async (request: NextRequest) => {
  try {
    const searchParams = request.nextUrl.searchParams;
    const active = searchParams.get('active');

    if (active === 'true') {
      const limitParam = searchParams.get('limit');
      const MAX_LIMIT = 100;
      const DEFAULT_LIMIT = 10;
      const limit = limitParam
        ? Math.min(Math.max(1, parseInt(limitParam, 10)), MAX_LIMIT)
        : DEFAULT_LIMIT;

      const result = await FeaturedArtistsService.getFeaturedArtists(new Date(), limit);

      if (!result.success) {
        return NextResponse.json(
          { error: result.error },
          { status: result.error === 'Database unavailable' ? 503 : 500 }
        );
      }

      return NextResponse.json(
        {
          featuredArtists: attachStreamUrls(serializeForResponse(result.data)),
          count: result.data.length,
        },
        {
          headers: {
            'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300',
          },
        }
      );
    }

    const search = searchParams.get('search');
    const publishedParam = searchParams.get('published');
    const published =
      publishedParam === 'true' ? true : publishedParam === 'false' ? false : undefined;
    const deleted = searchParams.get('deleted') === 'true';

    const session = await auth();
    if (!session?.user?.id || session.user?.role !== 'admin') {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    const skip = Math.max(0, parseInt(searchParams.get('skip') ?? '0', 10) || 0);
    const take = Math.min(
      Math.max(1, parseInt(searchParams.get('take') ?? String(DEFAULT_TAKE), 10) || DEFAULT_TAKE),
      MAX_TAKE
    );

    const params = {
      skip,
      take,
      ...(search && { search }),
      ...(published !== undefined && { published }),
      ...(deleted && { deleted }),
    };

    const result = await FeaturedArtistsService.getAllFeaturedArtists(params);

    if (!result.success) {
      return NextResponse.json(
        { error: result.error },
        { status: result.error === 'Database unavailable' ? 503 : 500 }
      );
    }

    return NextResponse.json(
      {
        rows: serializeForResponse(result.data),
        nextSkip: computeNextSkip(result.data.length, skip, take),
      },
      {
        headers: {
          'Cache-Control': 'private, no-store',
        },
      }
    );
  } catch (error) {
    loggers.media.error('FeaturedArtist GET error', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
});

/**
 * POST /api/featured-artists
 * Create a new featured artist
 * Requires admin role
 */
export const POST = await withAdmin(async (request: NextRequest) => {
  try {
    const body = await request.json();
    const validation = validateBody(createFeaturedArtistSchema, body);

    if (!validation.success) {
      return validation.response;
    }

    const result = await FeaturedArtistsService.createFeaturedArtist(
      validation.data as Prisma.FeaturedArtistCreateInput
    );

    if (!result.success) {
      const status = result.error === 'Database unavailable' ? 503 : 500;
      return NextResponse.json({ error: result.error }, { status });
    }

    return NextResponse.json(serializeForResponse(result.data), { status: 201 });
  } catch (error) {
    loggers.media.error('FeaturedArtist POST error', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
});
