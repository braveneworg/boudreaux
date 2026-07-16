/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import type { PlaylistSearchItem } from '@/lib/types/domain/playlist';
import type { AddPlaylistItemInput } from '@/lib/validation/playlist-schema';

/** Builds the exact add-item action input from a search item's source ref. */
export const buildAddPlaylistItemInput = (
  { source }: PlaylistSearchItem,
  playlistId: string,
  force: boolean
): AddPlaylistItemInput =>
  'trackFileId' in source
    ? { itemType: 'track', trackFileId: source.trackFileId, playlistId, force }
    : { itemType: 'video', videoId: source.videoId, playlistId, force };
