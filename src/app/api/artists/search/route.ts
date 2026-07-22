/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

import { SEARCH_LIMIT, searchLimiter } from '@/lib/config/rate-limit-tiers';
import { withRateLimit } from '@/lib/decorators/with-rate-limit';
import { ArtistService } from '@/lib/services/artist-service';
import type { ArtistSearchMatch } from '@/lib/types/domain/artist';
import { getArtistDisplayName } from '@/lib/utils/get-artist-display-name';
import { httpStatusForCode } from '@/lib/utils/http-status-for-code';
import { loggers } from '@/lib/utils/logger';

export const dynamic = 'force-dynamic';

/**
 * Lightweight result shape for the artist search combobox.
 */
interface ArtistSearchResult {
  artistSlug: string;
  artistName: string;
  thumbnailSrc: string | null;
  /** Published release titles for this artist (used for display and matching) */
  releases: Array<{ id: string; title: string }>;
}

const CACHE_HEADER = 'public, s-maxage=60, stale-while-revalidate=300';

const mapArtistToComboboxResult = (artist: ArtistSearchMatch): ArtistSearchResult => {
  const releases = artist.releases
    .map(({ release }) => release)
    .filter((r) => r.publishedAt != null && r.deletedOn == null);
  return {
    artistSlug: artist.slug,
    artistName: getArtistDisplayName(artist),
    thumbnailSrc: artist.images[0]?.src ?? null,
    releases: releases.map((r) => ({ id: r.id, title: r.title })),
  };
};

const handleFullFormat = async (query: string): Promise<NextResponse> => {
  const result = query
    ? await ArtistService.searchPublishedArtists({ search: query, take: 50 })
    : { success: true as const, data: [] };

  if (!result.success) {
    return NextResponse.json({ error: result.error }, { status: httpStatusForCode(result.code) });
  }

  return NextResponse.json(
    { artists: result.data },
    { headers: { 'Cache-Control': CACHE_HEADER } }
  );
};

/**
 * GET /api/artists/search?q=...
 * Public endpoint — searches published, active artists by name, group, or
 * release title.
 *
 * Query params:
 *   q      – Search query (minimum 3 characters for combobox mode).
 *   format – When "full", returns raw artist objects for the search results page.
 *            Default returns lightweight combobox-optimized shape.
 */
export const GET = withRateLimit(
  searchLimiter,
  SEARCH_LIMIT
)(async (request: NextRequest) => {
  try {
    const query = request.nextUrl.searchParams.get('q') ?? '';
    const format = request.nextUrl.searchParams.get('format');

    if (format === 'full') {
      return await handleFullFormat(query);
    }

    if (query.length < 3) {
      return NextResponse.json({ results: [] }, { headers: { 'Cache-Control': CACHE_HEADER } });
    }

    const result = await ArtistService.searchPublishedArtists({ search: query, take: 20 });

    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: httpStatusForCode(result.code) });
    }

    const results = result.data.map(mapArtistToComboboxResult);

    return NextResponse.json({ results }, { headers: { 'Cache-Control': CACHE_HEADER } });
  } catch (error) {
    loggers.media.error('Artist search error', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
});
