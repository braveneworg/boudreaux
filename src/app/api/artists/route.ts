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
import { ArtistService } from '@/lib/services/artist-service';
import type { CreateArtistData } from '@/lib/types/domain/artist';
import { computeNextSkip } from '@/lib/types/pagination';
import { httpStatusForCode } from '@/lib/utils/http-status-for-code';
import { loggers } from '@/lib/utils/logger';
import { validateBody } from '@/lib/utils/validate-request';
import { artistListingQuerySchema } from '@/lib/validation/artist-listing-query-schema';
import { createArtistSchema } from '@/lib/validation/create-artist-schema';

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

/**
 * The public listing carries no per-user data, so it may be shared-cached
 * briefly; the admin listing never is.
 */
const PUBLIC_CACHE_HEADERS = {
  'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300',
} as const;
const ADMIN_CACHE_HEADERS = { 'Cache-Control': 'private, no-store' } as const;

/**
 * Handle the public `listing=published` branch — no sign-in required. The
 * query is degraded to defaults rather than rejected (see
 * `artistListingQuerySchema`), and the service's narrow projection is what
 * ships: no contact fields ever leave here.
 */
const handlePublishedListing = async (searchParams: URLSearchParams): Promise<NextResponse> => {
  const filters = artistListingQuerySchema.parse({
    search: searchParams.get('search') ?? undefined,
    sort: searchParams.get('sort') ?? undefined,
    skip: searchParams.get('skip') ?? undefined,
    take: searchParams.get('take') ?? undefined,
  });

  const result = await ArtistService.listPublishedArtists(filters);

  if (!result.success) {
    return NextResponse.json({ error: result.error }, { status: httpStatusForCode(result.code) });
  }

  return NextResponse.json(
    {
      rows: result.data,
      nextSkip: computeNextSkip(result.data.length, filters.skip, filters.take),
    },
    { headers: PUBLIC_CACHE_HEADERS }
  );
};

/** Handle the admin (default) branch — gated on a signed-in admin session. */
const handleAdminListing = async (searchParams: URLSearchParams): Promise<NextResponse> => {
  const session = await auth();
  const authError = requireAdmin(session);
  if (authError) {
    return authError;
  }

  const { skip, take } = parsePagination(searchParams);
  const search = searchParams.get('search');
  const published = parsePublished(searchParams.get('published'));
  const deleted = searchParams.get('deleted') === 'true';

  const params = {
    skip,
    take,
    ...(search && { search }),
    ...(published !== undefined && { published }),
    ...(deleted && { deleted }),
  };

  const result = await ArtistService.getArtists(params);

  if (!result.success) {
    return NextResponse.json({ error: result.error }, { status: httpStatusForCode(result.code) });
  }

  return NextResponse.json(
    {
      rows: result.data,
      nextSkip: computeNextSkip(result.data.length, skip, take),
    },
    { headers: ADMIN_CACHE_HEADERS }
  );
};

/**
 * GET /api/artists
 *
 * Rate-limited on the public tier (like `/api/videos`); auth is per branch.
 *
 * Query params:
 *   listing   – When "published", returns one page of listed artists for any
 *               visitor via `ArtistService.listPublishedArtists` (ADR-0007);
 *               honors `skip`, `take`, `sort` (`alpha` | `newest`), and a
 *               name/aka/genre/release-title `search`.
 *   skip, take, search, published, deleted – Pagination/filter params for the
 *               admin listing mode (requires the admin role; `skip` default 0,
 *               `take` default 24 clamped to 100, `published` 'true'/'false',
 *               `deleted` 'true').
 */
export const GET = withRateLimit(
  publicLimiter,
  PUBLIC_LIMIT
)(async (request: NextRequest) => {
  try {
    const searchParams = request.nextUrl.searchParams;

    return searchParams.get('listing') === 'published'
      ? await handlePublishedListing(searchParams)
      : await handleAdminListing(searchParams);
  } catch (error) {
    loggers.media.error('Artist GET error', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
});

/**
 * POST /api/artists
 * Create a new artist
 * Requires admin role
 */
export const POST = await withAdmin(async (request: NextRequest) => {
  try {
    const body = await request.json();
    const validation = validateBody(createArtistSchema, body);

    if (!validation.success) {
      return validation.response;
    }

    const result = await ArtistService.createArtist(validation.data as unknown as CreateArtistData);

    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: httpStatusForCode(result.code) });
    }

    return NextResponse.json(result.data, { status: 201 });
  } catch (error) {
    loggers.media.error('Artist POST error', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
});
