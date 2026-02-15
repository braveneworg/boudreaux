/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

import { withAdmin } from '@/lib/decorators/with-auth';
import { ArtistService } from '@/lib/services/artist-service';
import { extractFieldsWithValues } from '@/lib/utils/data-utils';

import type { Prisma } from '@prisma/client';

export const dynamic = 'force-dynamic';

/**
 * GET /api/artist
 * Get all artists or search for artists
 * Query params: skip, take, isActive, search
 */
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const skip = searchParams.get('skip');
    const take = searchParams.get('take');
    const search = searchParams.get('search');

    const params = {
      ...(skip && { skip: parseInt(skip, 10) }),
      ...(take && { take: parseInt(take, 10) }),
      ...(search && { search }),
    };

    const result = await ArtistService.getArtists(params);

    if (!result.success) {
      return NextResponse.json(
        { error: result.error },
        { status: result.error === 'Database unavailable' ? 503 : 500 }
      );
    }

    return NextResponse.json({
      artists: result.data,
      count: result.data.length,
    });
  } catch (error) {
    console.error('Artist GET error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * POST /api/artist
 * Create a new artist
 * Requires admin role
 */
export const POST = await withAdmin(async (request: NextRequest) => {
  try {
    const body = await extractFieldsWithValues(request.json());

    // Basic validation
    if (!body.firstName || !body.surname || !body.slug) {
      return NextResponse.json(
        { error: 'firstName, surname, and slug are required' },
        { status: 400 }
      );
    }

    const result = await ArtistService.createArtist(body as Prisma.ArtistCreateInput);

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
