/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

import { withAdmin } from '@/lib/decorators/with-auth';
import { ArtistService } from '@/lib/services/artist-service';
import { validateBody } from '@/lib/utils/validate-request';
import { createArtistSchema } from '@/lib/validation/create-artist-schema';

import { auth } from '../../../../auth';

import type { Prisma } from '@prisma/client';

export const dynamic = 'force-dynamic';

/**
 * GET /api/artists
 * Get all artists or search for artists
 * Query params: skip, take, isActive, search
 */
export async function GET(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id || session.user?.role !== 'admin') {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    const searchParams = request.nextUrl.searchParams;
    const skip = searchParams.get('skip');
    const take = searchParams.get('take');
    const search = searchParams.get('search');

    const MAX_TAKE = 100;
    const params = {
      ...(skip && { skip: Math.max(0, parseInt(skip, 10)) }),
      ...(take && { take: Math.min(Math.max(1, parseInt(take, 10)), MAX_TAKE) }),
      ...(search && { search }),
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
        artists: result.data,
        count: result.data.length,
      },
      {
        headers: {
          'Cache-Control': 'private, no-store',
        },
      }
    );
  } catch (error) {
    console.error('Artist GET error:', error);
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

    const result = await ArtistService.createArtist(validation.data as Prisma.ArtistCreateInput);

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
    console.error('Artist POST error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
});
