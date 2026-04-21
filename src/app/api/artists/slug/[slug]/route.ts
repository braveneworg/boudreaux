/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

import { PUBLIC_LIMIT, publicLimiter } from '@/lib/config/rate-limit-tiers';
import { withRateLimit } from '@/lib/decorators/with-rate-limit';
import { ArtistService } from '@/lib/services/artist-service';

export const dynamic = 'force-dynamic';

function serializeForResponse<T>(data: T): T {
  return JSON.parse(JSON.stringify(data, (_key, v) => (typeof v === 'bigint' ? Number(v) : v)));
}

/**
 * GET /api/artist/slug/[slug]
 * Get a single artist by slug.
 *
 * Query params:
 *   withReleases – When "true", returns the artist with published releases
 *                  using `getArtistBySlugWithReleases()`.
 */
export const GET = withRateLimit<{ slug: string }>(
  publicLimiter,
  PUBLIC_LIMIT
)(async (request: NextRequest, { params }: { params: Promise<{ slug: string }> }) => {
  try {
    const { slug } = await params;

    // Validate slug format: lowercase alphanumeric + hyphens, max 100 chars
    if (!/^[a-z0-9](?:[a-z0-9-]{0,98}[a-z0-9])?$/.test(slug)) {
      return NextResponse.json({ error: 'Invalid slug format' }, { status: 400 });
    }

    const withReleases = request.nextUrl.searchParams.get('withReleases') === 'true';

    const result = withReleases
      ? await ArtistService.getArtistBySlugWithReleases(slug)
      : await ArtistService.getArtistBySlug(slug);

    if (!result.success) {
      const status =
        result.error === 'Artist not found'
          ? 404
          : result.error === 'Database unavailable'
            ? 503
            : 500;
      return NextResponse.json({ error: result.error }, { status });
    }

    return NextResponse.json(serializeForResponse(result.data), {
      headers: { 'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300' },
    });
  } catch (error) {
    console.error('Artist slug GET error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
});
