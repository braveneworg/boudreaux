/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

import { auth } from '@/auth';
import type { ServerSession } from '@/lib/auth/get-server-session';
import { withAdmin } from '@/lib/decorators/with-auth';
import { ArtistService } from '@/lib/services/artist-service';
import type { CreateArtistData } from '@/lib/types/domain/artist';
import { computeNextSkip } from '@/lib/types/pagination';
import { loggers } from '@/lib/utils/logger';
import { validateBody } from '@/lib/utils/validate-request';
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

/** Map a service error to a 503 (DB unavailable) or 500 (generic) status. */
const errorStatus = (error: string | undefined): number =>
  error === 'Database unavailable' ? 503 : 500;

/** Return a 401 response unless the session belongs to an authenticated admin. */
const requireAdmin = (session: ServerSession | null): NextResponse | null =>
  !session?.user?.id || session.user?.role !== 'admin'
    ? NextResponse.json({ error: 'Authentication required' }, { status: 401 })
    : null;

/**
 * GET /api/artists
 * Returns a skip/offset page of artists for the admin listing, optionally
 * filtered by a server-side `search` term and `published`/`deleted` state.
 *
 * Query params: `skip` (default 0), `take` (default 24, clamped to 100),
 * `search`, `published` ('true'/'false'), `deleted` ('true').
 */
export async function GET(request: NextRequest) {
  try {
    const session = await auth();
    const authError = requireAdmin(session);
    if (authError) {
      return authError;
    }

    const searchParams = request.nextUrl.searchParams;
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
      return NextResponse.json({ error: result.error }, { status: errorStatus(result.error) });
    }

    return NextResponse.json(
      {
        rows: result.data,
        nextSkip: computeNextSkip(result.data.length, skip, take),
      },
      {
        headers: {
          'Cache-Control': 'private, no-store',
        },
      }
    );
  } catch (error) {
    loggers.media.error('Artist GET error', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

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
      const status =
        result.error === 'Artist with this slug already exists'
          ? 409
          : result.error === 'Database unavailable'
            ? 503
            : 500;
      return NextResponse.json({ error: result.error }, { status });
    }

    return NextResponse.json(result.data, { status: 201 });
  } catch (error) {
    loggers.media.error('Artist POST error', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
});
