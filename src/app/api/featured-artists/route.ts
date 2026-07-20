/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

import { auth } from '@/auth';
import type { ServerSession } from '@/lib/auth/get-server-session';
import { PUBLIC_LIMIT, publicLimiter } from '@/lib/config/rate-limit-tiers';
import { withAdmin } from '@/lib/decorators/with-auth';
import { withRateLimit } from '@/lib/decorators/with-rate-limit';
import { FeaturedArtistsService } from '@/lib/services/featured-artists-service';
import type { CreateFeaturedArtistData } from '@/lib/types/domain/featured-artist';
import { computeNextSkip } from '@/lib/types/pagination';
import { attachStreamUrls } from '@/lib/utils/attach-stream-urls';
import { httpStatusForCode } from '@/lib/utils/http-status-for-code';
import { loggers } from '@/lib/utils/logger';
import { serializeForResponse } from '@/lib/utils/serialize-for-response';
import { validateBody } from '@/lib/utils/validate-request';
import { createFeaturedArtistSchema } from '@/lib/validation/create-featured-artist-schema';

export const dynamic = 'force-dynamic';

const DEFAULT_TAKE = 24;
const MAX_TAKE = 100;

/** Parse and clamp the `skip`/`take` offset-pagination params from a request. */
const parsePagination = (searchParams: URLSearchParams): { skip: number; take: number } => {
  const skip = Math.max(0, parseInt(searchParams.get('skip') ?? '0', 10) || 0);
  const take = Math.min(
    Math.max(1, parseInt(searchParams.get('take') ?? String(DEFAULT_TAKE), 10) || DEFAULT_TAKE),
    MAX_TAKE
  );
  return { skip, take };
};

/** Parse the tri-state `published` filter ('true' → true, 'false' → false, else undefined). */
const parsePublished = (value: string | null): boolean | undefined =>
  value === 'true' ? true : value === 'false' ? false : undefined;

/** Return a 401 response unless the session belongs to an authenticated admin. */
const requireAdmin = (session: ServerSession | null): NextResponse | null =>
  !session?.user?.id || session.user?.role !== 'admin'
    ? NextResponse.json({ error: 'Authentication required' }, { status: 401 })
    : null;

/** Handle the public `active=true` branch of GET /api/featured-artists. */
const handleActiveListing = async (searchParams: URLSearchParams): Promise<NextResponse> => {
  const limitParam = searchParams.get('limit');
  const MAX_LIMIT = 100;
  const DEFAULT_LIMIT = 10;
  const limit = limitParam
    ? Math.min(Math.max(1, parseInt(limitParam, 10)), MAX_LIMIT)
    : DEFAULT_LIMIT;

  const result = await FeaturedArtistsService.getFeaturedArtists(new Date(), limit);

  if (!result.success) {
    return NextResponse.json({ error: result.error }, { status: httpStatusForCode(result.code) });
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
};

/** Handle the admin (default) branch of GET /api/featured-artists, gated on admin auth. */
const handleAdminListing = async (searchParams: URLSearchParams): Promise<NextResponse> => {
  const search = searchParams.get('search');
  const published = parsePublished(searchParams.get('published'));
  const deleted = searchParams.get('deleted') === 'true';

  const session = await auth();
  const authError = requireAdmin(session);
  if (authError) {
    return authError;
  }

  const { skip, take } = parsePagination(searchParams);

  const params = {
    skip,
    take,
    ...(search && { search }),
    ...(published !== undefined && { published }),
    ...(deleted && { deleted }),
  };

  const result = await FeaturedArtistsService.getAllFeaturedArtists(params);

  if (!result.success) {
    return NextResponse.json({ error: result.error }, { status: httpStatusForCode(result.code) });
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
};

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

    return active === 'true'
      ? await handleActiveListing(searchParams)
      : await handleAdminListing(searchParams);
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
      validation.data as unknown as CreateFeaturedArtistData
    );

    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: httpStatusForCode(result.code) });
    }

    return NextResponse.json(serializeForResponse(result.data), { status: 201 });
  } catch (error) {
    loggers.media.error('FeaturedArtist POST error', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
});
