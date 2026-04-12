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
import { isValidObjectId } from '@/lib/utils/validation/object-id';
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
      const status =
        result.error === 'Featured artist not found'
          ? 404
          : result.error === 'Database unavailable'
            ? 503
            : 500;
      return NextResponse.json({ error: result.error }, { status });
    }

    return NextResponse.json(serializeBigInts(result.data), {
      headers: { 'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300' },
    });
  } catch (error) {
    console.error('FeaturedArtist GET by ID error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
});

/**
 * PATCH /api/featured-artists/[id]
 * Update a featured artist by ID
 */
export const PATCH = withAdmin(
  async (request: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
    try {
      const { id } = await params;
      const body = await request.json();
      const validation = validateBody(updateFeaturedArtistSchema, body);

      if (!validation.success) {
        return validation.response;
      }

      // Convert date strings to Date objects for Prisma DateTime fields
      const { artistIds, ...scalarData } = validation.data;
      const updateData: Prisma.FeaturedArtistUpdateInput = {
        ...(scalarData as Record<string, unknown>),
        ...(scalarData.publishedOn && { publishedOn: new Date(scalarData.publishedOn) }),
        ...(scalarData.featuredOn && { featuredOn: new Date(scalarData.featuredOn) }),
        ...(scalarData.featuredUntil && {
          featuredUntil: new Date(scalarData.featuredUntil),
        }),
        // Reconnect artists: clear existing connections and set the new ones
        ...(artistIds && {
          artists: {
            set: artistIds.map((artistId: string) => ({ id: artistId })),
          },
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
);

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
);
