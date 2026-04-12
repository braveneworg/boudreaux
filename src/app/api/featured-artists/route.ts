/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

import { PUBLIC_LIMIT, publicLimiter } from '@/lib/config/rate-limit-tiers';
import { withAdmin } from '@/lib/decorators/with-auth';
import { withRateLimit } from '@/lib/decorators/with-rate-limit';
import { FeaturedArtistsService } from '@/lib/services/featured-artists-service';
import { validateBody } from '@/lib/utils/validate-request';
import { createFeaturedArtistSchema } from '@/lib/validation/create-featured-artist-schema';

import { auth } from '../../../../auth';

import type { Prisma } from '@prisma/client';

export const dynamic = 'force-dynamic';

/** Convert BigInt values to Number so NextResponse.json() can serialize them. */
function serializeBigInts<T>(data: T): T {
  return JSON.parse(JSON.stringify(data, (_key, v) => (typeof v === 'bigint' ? Number(v) : v)));
}

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
          featuredArtists: serializeBigInts(result.data),
          count: result.data.length,
        },
        {
          headers: {
            'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300',
          },
        }
      );
    }

    const skip = searchParams.get('skip');
    const take = searchParams.get('take');
    const search = searchParams.get('search');

    const session = await auth();
    if (!session?.user?.id || session.user?.role !== 'admin') {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    const MAX_TAKE = 100;
    const params = {
      ...(skip && { skip: Math.max(0, parseInt(skip, 10)) }),
      ...(take && { take: Math.min(Math.max(1, parseInt(take, 10)), MAX_TAKE) }),
      ...(search && { search }),
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
        featuredArtists: serializeBigInts(result.data),
        count: result.data.length,
      },
      {
        headers: {
          'Cache-Control': 'private, no-store',
        },
      }
    );
  } catch (error) {
    console.error('FeaturedArtist GET error:', error);
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

    return NextResponse.json(serializeBigInts(result.data), { status: 201 });
  } catch (error) {
    console.error('FeaturedArtist POST error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
});
