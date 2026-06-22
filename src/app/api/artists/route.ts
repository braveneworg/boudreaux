/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

import { auth } from '@/auth';
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
    if (!session?.user?.id || session.user?.role !== 'admin') {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    const searchParams = request.nextUrl.searchParams;
    const skip = Math.max(0, parseInt(searchParams.get('skip') ?? '0', 10) || 0);
    const take = Math.min(
      Math.max(1, parseInt(searchParams.get('take') ?? String(DEFAULT_TAKE), 10) || DEFAULT_TAKE),
      MAX_TAKE
    );
    const search = searchParams.get('search');
    const publishedParam = searchParams.get('published');
    const published =
      publishedParam === 'true' ? true : publishedParam === 'false' ? false : undefined;
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
      return NextResponse.json(
        { error: result.error },
        { status: result.error === 'Database unavailable' ? 503 : 500 }
      );
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
