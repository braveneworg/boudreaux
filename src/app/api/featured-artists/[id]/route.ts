/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

import { FeaturedArtistsService } from '@/lib/services/featured-artists-service';
import { validateBody } from '@/lib/utils/validate-request';
import { updateFeaturedArtistSchema } from '@/lib/validation/update-schemas';

import type { Prisma } from '@prisma/client';

/** Convert BigInt values to Number so NextResponse.json() can serialize them. */
function serializeBigInts<T>(data: T): T {
  return JSON.parse(JSON.stringify(data, (_key, v) => (typeof v === 'bigint' ? Number(v) : v)));
}

/**
 * GET /api/featured-artists/[id]
 * Get a single featured artist by ID
 */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;

    const result = await FeaturedArtistsService.getFeaturedArtistById(id);

    if (!result.success) {
      const status =
        result.error === 'Featured artist not found'
          ? 404
          : result.error === 'Database unavailable'
            ? 503
            : 500;
      return NextResponse.json({ error: result.error }, { status });
    }

    return NextResponse.json(serializeBigInts(result.data));
  } catch (error) {
    console.error('FeaturedArtist GET by ID error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * PATCH /api/featured-artists/[id]
 * Update a featured artist by ID
 */
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await request.json();
    const validation = validateBody(updateFeaturedArtistSchema, body);

    if (!validation.success) {
      return validation.response;
    }

    // Convert date strings to Date objects for Prisma DateTime fields
    const updateData: Prisma.FeaturedArtistUpdateInput = {
      ...(validation.data as Record<string, unknown>),
      ...(validation.data.publishedOn && { publishedOn: new Date(validation.data.publishedOn) }),
      ...(validation.data.featuredOn && { featuredOn: new Date(validation.data.featuredOn) }),
      ...(validation.data.featuredUntil && {
        featuredUntil: new Date(validation.data.featuredUntil),
      }),
    };

    const result = await FeaturedArtistsService.updateFeaturedArtist(id, updateData);

    if (!result.success) {
      const status =
        result.error === 'Featured artist not found'
          ? 404
          : result.error === 'Database unavailable'
            ? 503
            : 500;
      return NextResponse.json({ error: result.error }, { status });
    }

    return NextResponse.json(serializeBigInts(result.data));
  } catch (error) {
    console.error('FeaturedArtist PATCH error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * DELETE /api/featured-artists/[id]
 * Delete a featured artist by ID
 */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const result = await FeaturedArtistsService.hardDeleteFeaturedArtist(id);

    if (!result.success) {
      const status =
        result.error === 'Featured artist not found'
          ? 404
          : result.error === 'Database unavailable'
            ? 503
            : 500;
      return NextResponse.json({ error: result.error }, { status });
    }

    return NextResponse.json({ message: 'Featured artist deleted successfully' });
  } catch (error) {
    console.error('FeaturedArtist DELETE error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
