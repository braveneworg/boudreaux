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
 * The `sizes` of a spotlight card's cover. On a phone the one-column card
 * fills the panel, so the cover is as wide as the viewport less the panel's
 * padding; `100vw` is the safe ceiling. From `sm` the card is capped at
 * `sm:max-w-[17.25rem]` (276px, a third wider than the 13rem it grew from so
 * the artwork leads the page), and every grid cell is at least that wide, so the
 * cover renders at 276px. The home page's cover preload uses the same string
 * as its `imagesizes`, so the preload and the card pick the same variant.
 */
export const SPOTLIGHT_COVER_SIZES = '(min-width: 640px) 276px, 100vw';

/**
 * Width, centered, from the left edge of the grid's first cover to the right
 * edge of its last column's cover, so a row above the grid (a page's search)
 * lines up with the covers. On a phone the single cover fills the panel, so
 * the span is the full width. From `sm` each 17.25rem cover is centered in a
 * cell, and cells sit 1.5rem apart (`gap-x-6`), so the outer edges lie
 * `100% - (cell - 17.25rem)` apart: `50% + 18rem` in two columns (`sm`),
 * `75% + 18.375rem` in four (`lg`). `min(100%, …)` covers cells narrower than
 * 17.25rem, where the covers fill them. Change it with the grid's gap, columns or
 * cover cap.
 */
export const SPOTLIGHT_COVER_SPAN_CLASS =
  'mx-auto w-full sm:w-[min(100%,calc(50%_+_18rem))] lg:w-[min(100%,calc(75%_+_18.375rem))]';

/**
 * The cover grid of the home page and `/releases`: one column on phones, two
 * from `sm`, four from `lg`. {@link SPOTLIGHT_COVER_SPAN_CLASS} assumes these
 * columns and the `gap-x-6`, so change them together.
 */
export const SPOTLIGHT_GRID_CLASS =
  'grid grid-cols-1 gap-x-6 gap-y-8 sm:grid-cols-2 lg:grid-cols-4';

/** One cover in the home or `/releases` grid, from a spotlight or a published release. */
export interface SpotlightCard {
  releaseId: string;
  title: string;
  /** The release date's UTC year. */
  year: number;
  /** The artist the card names; `null` for a release with no public credit. */
  artistName: string | null;
  /** Slug of the artist page the artist name links to; `null` leaves the name as text. */
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
 * Map published releases to grid cards: the `/releases` grid, and the home
 * grid's fallback when there is no spotlight to show. A card starts on the
 * release's first track.
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
