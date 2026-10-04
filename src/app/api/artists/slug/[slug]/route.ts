/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

import { PUBLIC_LIMIT, publicLimiter } from '@/lib/config/rate-limit-tiers';
import { withRateLimit } from '@/lib/decorators/with-rate-limit';
import { ArtistService } from '@/lib/services/artist-service';
import { httpStatusForCode } from '@/lib/utils/http-status-for-code';
import { loggers } from '@/lib/utils/logger';
import { serializeForResponse } from '@/lib/utils/serialize-for-response';
import { artistWithPublishedReleasesSchema } from '@/lib/validation/media/artist-schema';
import { artistPublicScalarSchema } from '@/lib/validation/media/shared-schema';
import { isSlug } from '@/lib/validation/primitives';

export const dynamic = 'force-dynamic';

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

    if (!isSlug(slug)) {
      return NextResponse.json({ error: 'Invalid slug format' }, { status: 400 });
    }

    const withReleases = request.nextUrl.searchParams.get('withReleases') === 'true';

    const result = withReleases
      ? await ArtistService.getArtistBySlugWithReleases(slug)
      : await ArtistService.getArtistBySlug(slug);

    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: httpStatusForCode(result.code) });
    }

    // Response guard (#765): the repository already projects every artist on
    // the graph to its public scalars, and parsing through the public wire
    // schema — whose objects strip unknown keys — drops anything a future
    // include/select re-adds (contact PII, notes, audit actors, job tokens)
    // before it can be serialised. Each release carries only the playable
    // format, whose files are served unsigned, so nothing in it is signed.
    const responseData = withReleases
      ? serializeForResponse(artistWithPublishedReleasesSchema.parse(result.data))
      : serializeForResponse(artistPublicScalarSchema.parse(result.data));

    // The projected payload carries nothing private, so it may stay
    // shared-cacheable.
    return NextResponse.json(responseData, {
      headers: { 'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300' },
    });
  } catch (error) {
    loggers.media.error('Artist slug GET error', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
});
