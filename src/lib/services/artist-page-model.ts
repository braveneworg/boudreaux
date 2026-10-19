/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import 'server-only';

import { publicArtist, type PublicArtistFields } from '@/lib/repositories/_internal/visibility';
import type {
  ArtistDisplayImage,
  ArtistPageBioImageRecord,
  ArtistPageModel,
  ArtistPageScalars,
  LatestRelease,
} from '@/lib/types/domain/artist';
import {
  collectArtistReleases,
  deriveOwnReleaseCredit,
  publicCredits,
  summarizeListedReleases,
  type SummarizableReleaseRow,
} from '@/lib/utils/artist-release-credits';
import {
  CARD_DISPLAY_IMAGE_COUNT,
  resolveDisplayImages,
  type DisplayImageCandidate,
} from '@/lib/utils/display-images';
import {
  getArtistDisplayNameForRelease,
  getFirstTrackStreamSource,
} from '@/lib/utils/release-helpers';
import { sanitizeBioHtml } from '@/lib/utils/sanitize-bio-html';

/**
 * The artist page model: what a public surface shows of an Artist, built in
 * one place. The artist page reads all of it; the artists index card reads
 * its first display image and its latest release; a spotlight and the home
 * search read the first display image. The display-image rules stay in
 * `display-images.ts` (ADR-0008) and the credit rules in
 * `artist-release-credits.ts`; this module applies them once per surface and
 * keeps the pool's internals off every payload.
 */

/** A credited artist as the latest release reads it: its name, slug and visibility fields. */
interface LatestReleaseCreditArtist extends PublicArtistFields {
  id: string;
  firstName: string;
  surname: string;
  displayName: string | null;
  slug: string;
}

/** One of an artist's release join rows, as the latest release reads it. */
export interface LatestReleaseSourceRow {
  release: SummarizableReleaseRow['release'] & {
    /** The playable format with its first track. */
    digitalFormats: Array<{ files: Array<{ s3Key: string }> }>;
    /** The full credit order; the first credit is the album artist. */
    artistReleases: Array<{ artistId: string; artist: LatestReleaseCreditArtist }>;
  };
}

/** The artist-detail read the page model is built from. */
export interface ArtistPageSource extends ArtistPageScalars {
  id: string;
  /** The rows display-image resolution can return, in pool order. */
  bioImages: ArtistPageBioImageRecord[];
  /** The artist's direct release joins. */
  releases: LatestReleaseSourceRow[];
  /** The bands the artist belongs to, hidden ones included, with their release joins. */
  memberOf: Array<{ artist: PublicArtistFields & { releases: LatestReleaseSourceRow[] } }>;
}

/**
 * The display images an index card shows — the first one — for the artists
 * index row, a spotlight's artists and the home search thumbnail.
 *
 * @param rows - The artist's display-image candidates in pool order.
 * @returns The caller's own rows, resolved and cut to the card count.
 */
export const cardDisplayImages = <T extends DisplayImageCandidate>(rows: readonly T[]): T[] =>
  resolveDisplayImages(rows).slice(0, CARD_DISPLAY_IMAGE_COUNT);

/**
 * An artist's latest release: the newest listed release they hold a direct
 * credit on (primary or featured), by release date, with its first MP3
 * track's stream URL. A featured release is "by" its album artist, whose slug
 * names the deep link, while that artist is public; a hidden album artist, or
 * a release of their own, leaves both empty so the artist's own slug serves
 * (ADR-0006, ADR-0015).
 *
 * @param artistId - The artist whose latest release this is.
 * @param rows - Their direct release joins, listed or not.
 * @returns The latest release, or `null` when no direct release is listed.
 */
export const buildLatestRelease = (
  artistId: string,
  rows: LatestReleaseSourceRow[]
): LatestRelease | null => {
  const { newestRelease } = summarizeListedReleases(rows);
  const release = rows.find((row) => row.release.id === newestRelease?.id)?.release;
  if (!newestRelease || !release) return null;
  const albumArtist =
    deriveOwnReleaseCredit(artistId, release) === 'featured'
      ? publicCredits(release.artistReleases).albumArtist
      : null;
  return {
    ...newestRelease,
    playSrc: getFirstTrackStreamSource(release),
    byName: albumArtist ? getArtistDisplayNameForRelease(albumArtist) : null,
    albumArtistSlug: albumArtist?.slug ?? null,
  };
};

/** A display image with exactly the fields the collage renders and credits. */
const toDisplayImage = ({
  id,
  url,
  thumbnailUrl,
  alt,
  title,
  attribution,
  license,
  sourceUrl,
  width,
  height,
}: ArtistDisplayImage): ArtistDisplayImage => ({
  id,
  url,
  thumbnailUrl,
  alt,
  title,
  attribution,
  license,
  sourceUrl,
  width,
  height,
});

/**
 * Build the artist page model from the artist-detail read.
 *
 * - The display images are all of them: the human's chosen rows in order, or
 *   a grandfathered artist's fallback tiers (ADR-0008).
 * - The latest release is read from the direct credits only, never a band's;
 *   on a release-date tie an own release leads a featured one.
 * - Whether any listed release exists counts a public band's releases too.
 * - The bios are sanitized on read, so redisplay is safe however they were
 *   authored. The short bio stays HTML; plain-text surfaces strip it.
 *
 * @param source - The repository read: the page scalars, the bio images, the
 *   direct release joins and the bands with theirs.
 * @returns The model; it carries nothing of the read beyond the page scalars.
 */
export const buildArtistPageModel = ({
  id,
  displayName,
  firstName,
  middleName,
  surname,
  title,
  suffix,
  slug,
  genres,
  links,
  bio,
  shortBio,
  bioImages,
  releases,
  memberOf,
}: ArtistPageSource): ArtistPageModel => {
  // Credits are derived from each release's full credit order, so hidden
  // artists are read first; a hidden band's releases do not count.
  const credited = collectArtistReleases({
    id,
    releases,
    memberOf: memberOf.filter(({ artist: band }) => publicArtist.matches(band)),
  });
  return {
    displayName,
    firstName,
    middleName,
    surname,
    title,
    suffix,
    slug,
    genres,
    links,
    bio: bio ? sanitizeBioHtml(bio) : bio,
    shortBio: shortBio ? sanitizeBioHtml(shortBio) : shortBio,
    displayImages: resolveDisplayImages(bioImages).map(toDisplayImage),
    latestRelease: buildLatestRelease(
      id,
      credited.filter(({ credit }) => credit !== 'member')
    ),
    hasListedRelease: credited.length > 0,
  };
};
