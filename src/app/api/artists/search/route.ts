/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

import { SEARCH_LIMIT, searchLimiter } from '@/lib/config/rate-limit-tiers';
import { withRateLimit } from '@/lib/decorators/with-rate-limit';
import { ArtistService } from '@/lib/services/artist-service';
import type {
  ArtistHomeSearchMatch,
  ArtistHomeSearchReleaseRecord,
  ArtistHomeSearchVideoRecord,
  ArtistSearchBioImage,
} from '@/lib/types/domain/artist';
import { resolveDisplayImages } from '@/lib/utils/display-images';
import { getArtistDisplayName } from '@/lib/utils/get-artist-display-name';
import { httpStatusForCode } from '@/lib/utils/http-status-for-code';
import { loggers } from '@/lib/utils/logger';
import { getFirstTrackStreamSource, getReleaseCoverArt } from '@/lib/utils/release-helpers';
import { signStreamUrl } from '@/lib/utils/sign-stream-url';

export const dynamic = 'force-dynamic';

/** A release row: what it shows, and the first track its pick starts playing. */
interface ArtistSearchReleaseResult {
  id: string;
  title: string;
  coverArtSrc: string | null;
  playSrc: string | null;
  year: number;
}

/** A video row: what it shows, and the signed stream URL its pick plays. */
interface ArtistSearchVideoResult {
  id: string;
  title: string;
  posterSrc: string | null;
  streamUrl: string | null;
  year: number;
  durationSeconds: number | null;
}

/**
 * Lightweight result shape for the home search combobox: one artist with its
 * playable releases and its live videos.
 */
interface ArtistSearchResult {
  artistSlug: string;
  artistName: string;
  thumbnailSrc: string | null;
  releases: ArtistSearchReleaseResult[];
  videos: ArtistSearchVideoResult[];
}

/**
 * Shared-cacheable: nothing in the answer is per visitor. The video stream
 * URLs are signed for 24 hours, far past this cache's lifetime.
 */
const CACHE_HEADER = 'public, s-maxage=60, stale-while-revalidate=300';

/** The thumbnail (or, lacking one, the full image) of the artist's first display image. */
const firstDisplayImageSrc = (bioImages: ArtistSearchBioImage[]): string | null => {
  const [first] = resolveDisplayImages(bioImages);
  return first ? (first.thumbnailUrl ?? first.url) : null;
};

const toReleaseResult = (release: ArtistHomeSearchReleaseRecord): ArtistSearchReleaseResult => ({
  id: release.id,
  title: release.title,
  coverArtSrc: getReleaseCoverArt(release)?.src ?? null,
  playSrc: getFirstTrackStreamSource(release),
  year: release.releasedOn.getUTCFullYear(),
});

/** A video row, or `null` for a video without a release date (no year to show). */
const toVideoResult = ({
  id,
  title,
  posterUrl,
  releasedOn,
  durationSeconds,
  s3Key,
}: ArtistHomeSearchVideoRecord): ArtistSearchVideoResult | null =>
  releasedOn
    ? {
        id,
        title,
        posterSrc: posterUrl,
        streamUrl: signStreamUrl(s3Key),
        year: releasedOn.getUTCFullYear(),
        durationSeconds,
      }
    : null;

const mapArtistToComboboxResult = (artist: ArtistHomeSearchMatch): ArtistSearchResult => ({
  artistSlug: artist.slug,
  artistName: getArtistDisplayName(artist),
  thumbnailSrc: firstDisplayImageSrc(artist.bioImages),
  releases: artist.releases.map(({ release }) => toReleaseResult(release)),
  videos: artist.videoArtists
    .map(({ video }) => toVideoResult(video))
    .filter((video): video is ArtistSearchVideoResult => video !== null),
});

/**
 * GET /api/artists/search?q=...
 * Public endpoint behind the home page search — searches the public artists
 * with a direct credit on a playable listed release or a video credit on a
 * live video, by name, release title or video title, returning the
 * lightweight combobox shape.
 *
 * Query params:
 *   q – Search query (minimum 3 characters; shorter queries return no results).
 */
export const GET = withRateLimit(
  searchLimiter,
  SEARCH_LIMIT
)(async (request: NextRequest) => {
  try {
    const query = request.nextUrl.searchParams.get('q') ?? '';

    if (query.length < 3) {
      return NextResponse.json({ results: [] }, { headers: { 'Cache-Control': CACHE_HEADER } });
    }

    const result = await ArtistService.searchForHomeNav({ search: query, take: 20 });

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
