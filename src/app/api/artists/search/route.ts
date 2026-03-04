/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

import { ArtistService } from '@/lib/services/artist-service';
import { getArtistDisplayName } from '@/lib/utils/get-artist-display-name';

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

/**
 * GET /api/artists/search?q=...
 * Public endpoint — searches published, active artists by name, group, or
 * release title. Returns a lightweight payload for the combobox dropdown.
 */
export async function GET(request: NextRequest) {
  try {
    const query = request.nextUrl.searchParams.get('q') ?? '';

    if (query.length < 3) {
      return NextResponse.json({ results: [] });
    }

    const result = await ArtistService.searchPublishedArtists({
      search: query,
      take: 20,
    });

    if (!result.success) {
      return NextResponse.json(
        { error: result.error },
        { status: result.error === 'Database unavailable' ? 503 : 500 }
      );
    }

    const results: ArtistSearchResult[] = result.data.map((artist) => {
      const releases = (
        artist.releases?.map(
          (ar: {
            release: {
              id: string;
              title: string;
              publishedAt: Date | null;
              deletedOn: Date | null;
            };
          }) => ar.release
        ) ?? []
      ).filter(
        (r: { publishedAt: Date | null; deletedOn: Date | null }) =>
          r.publishedAt !== null && r.deletedOn === null
      );

      return {
        artistSlug: artist.slug,
        artistName: getArtistDisplayName(artist),
        thumbnailSrc: artist.images?.[0]?.src ?? null,
        releases: releases.map((r: { id: string; title: string }) => ({
          id: r.id,
          title: r.title,
        })),
      };
    });

    return NextResponse.json({ results });
  } catch (error) {
    console.error('Artist search error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
