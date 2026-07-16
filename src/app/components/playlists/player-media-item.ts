/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import type { PlaylistSearchItem } from '@/lib/types/domain/playlist';

/**
 * Builds a `PlaylistSearchItem` for a track sourced from the media player.
 * The `context` field is intentionally left undefined — these items originate
 * from an active player, not a search response.
 */
export const trackMediaItem = ({
  trackFileId,
  releaseId,
  title,
  artistName,
  coverArt,
  duration,
}: {
  trackFileId: string;
  releaseId: string;
  title: string;
  artistName: string | null;
  coverArt: string | null;
  duration: number | null;
}): PlaylistSearchItem => ({
  key: `track:${trackFileId}`,
  itemType: 'track',
  title,
  artistName,
  coverArt,
  duration,
  source: { trackFileId, releaseId },
});

/**
 * Builds a `PlaylistSearchItem` for a video sourced from the media player.
 * The `context` field is intentionally left undefined — these items originate
 * from an active player, not a search response.
 */
export const videoMediaItem = ({
  videoId,
  title,
  artistName,
  coverArt,
  duration,
}: {
  videoId: string;
  title: string;
  artistName: string | null;
  coverArt: string | null;
  duration: number | null;
}): PlaylistSearchItem => ({
  key: `video:${videoId}`,
  itemType: 'video',
  title,
  artistName,
  coverArt,
  duration,
  source: { videoId },
});
