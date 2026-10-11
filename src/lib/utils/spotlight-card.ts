/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import type {
  FeaturedArtist,
  FeaturedArtistFormatFile,
  PublishedReleaseListing,
} from '@/lib/types/media-models';
import { resolveStreamUrl } from '@/lib/utils/cdn-url';
import { getFeaturedArtistCoverArt } from '@/lib/utils/get-featured-artist-cover-art';
import { getFeaturedArtistDisplayName } from '@/lib/utils/get-featured-artist-display-name';
import {
  getArtistDisplayNameForRelease,
  getFirstTrackStreamSource,
  getReleaseCoverArt,
} from '@/lib/utils/release-helpers';

/**
 * The `sizes` of a spotlight card's cover. The card is capped at `max-w-52`
 * (13rem), and every grid cell is at least that wide, so the cover renders at
 * 208px at every breakpoint. The home page's cover preload uses the same
 * string as its `imagesizes`, so the preload and the card pick the same
 * variant.
 */
export const SPOTLIGHT_COVER_SIZES = '208px';

/** One cover in the home page's spotlight grid, from a spotlight or a newest release. */
export interface SpotlightCard {
  releaseId: string;
  title: string;
  /** The release date's UTC year. */
  year: number;
  /** The artist the card names; `null` for a release with no public credit. */
  artistName: string | null;
  /** Slug of the artist page the title links to; `null` leaves the title as text. */
  artistSlug: string | null;
  coverArt: string | null;
  /** Stream URL of the track the modal starts on; `null` when nothing is playable. */
  playSrc: string | null;
  /** Track number of the file behind `playSrc` (spotlights only). */
  initialTrackNumber: number | null;
}

/** Return a copy of `files` sorted ascending by track number (non-mutating). */
const sortFilesByTrackNumber = (
  files: readonly FeaturedArtistFormatFile[]
): FeaturedArtistFormatFile[] => [...files].sort((a, b) => a.trackNumber - b.trackNumber);

/**
 * Pick the file a spotlight starts on: the featured track when
 * `featuredTrackNumber` is set and present, otherwise the first sorted file.
 * Returns `null` when there are no files.
 */
const resolveInitialFile = (
  files: readonly FeaturedArtistFormatFile[],
  featuredTrackNumber: number | null
): FeaturedArtistFormatFile | null => {
  const sorted = sortFilesByTrackNumber(files);
  const featured =
    featuredTrackNumber === null
      ? undefined
      : sorted.find((file) => file.trackNumber === featuredTrackNumber);
  return featured ?? sorted[0] ?? null;
};

/** Map one spotlight row to a card, or `null` when it cannot render. */
const toSpotlightCard = (featured: FeaturedArtist): SpotlightCard | null => {
  const { release } = featured;
  const artistName = getFeaturedArtistDisplayName(featured);
  if (!release || artistName === null) return null;

  const initialFile = resolveInitialFile(
    featured.digitalFormat?.files ?? [],
    featured.featuredTrackNumber
  );

  return {
    releaseId: release.id,
    title: release.title,
    year: release.releasedOn.getUTCFullYear(),
    artistName,
    artistSlug: featured.artists[0]?.slug ?? null,
    coverArt: getFeaturedArtistCoverArt(featured),
    playSrc: initialFile ? resolveStreamUrl(initialFile) : null,
    initialTrackNumber: initialFile?.trackNumber ?? null,
  };
};

/**
 * Map the active spotlight rows to grid cards, in the order given. Rows with
 * no release, or with no name to show, are skipped.
 */
export const toSpotlightCards = (featured: FeaturedArtist[]): SpotlightCard[] =>
  featured.flatMap((row) => toSpotlightCard(row) ?? []);

/**
 * Map newest published releases to grid cards: the grid's fallback when there
 * is no spotlight to show. A card starts on the release's first track.
 */
export const publishedReleasesToSpotlightCards = (
  rows: PublishedReleaseListing[]
): SpotlightCard[] =>
  rows.map((row) => ({
    releaseId: row.id,
    title: row.title,
    year: row.releasedOn.getUTCFullYear(),
    artistName: row.albumArtist ? getArtistDisplayNameForRelease(row.albumArtist) : null,
    artistSlug: row.albumArtist?.slug ?? null,
    coverArt: getReleaseCoverArt(row)?.src ?? null,
    playSrc: getFirstTrackStreamSource(row),
    initialTrackNumber: null,
  }));
