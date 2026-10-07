/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import type { LatestRelease } from '@/app/components/latest-release-link';
import type { ArtistWithPublishedReleases } from '@/lib/types/media-models';
import {
  getArtistDisplayNameForRelease,
  getFirstTrackStreamSource,
} from '@/lib/utils/release-helpers';

/**
 * The latest-release line's data (decision 6): the graph's `newestRelease`
 * summary (newest listed release with a direct credit, as the artists index
 * counts it), joined to its credit row for the first track's stream URL and,
 * when the artist is only featured, the album artist's name — empty when
 * that artist is hidden (ADR-0015). `null` when the artist has no listed
 * release; the summary alone when its row is somehow missing.
 */
export const toLatestRelease = (artist: ArtistWithPublishedReleases): LatestRelease | null => {
  const { newestRelease } = artist;
  if (!newestRelease) return null;
  const row = artist.releases.find(({ release }) => release.id === newestRelease.id);
  return {
    id: newestRelease.id,
    title: newestRelease.title,
    releasedOn: newestRelease.releasedOn,
    playSrc: row ? getFirstTrackStreamSource(row.release) : null,
    byName:
      row?.credit === 'featured' && row.albumArtist
        ? getArtistDisplayNameForRelease(row.albumArtist)
        : null,
  };
};
