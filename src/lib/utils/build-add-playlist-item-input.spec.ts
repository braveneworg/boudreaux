/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import type { PlaylistSearchItem } from '@/lib/types/domain/playlist';

import { buildAddPlaylistItemInput } from './build-add-playlist-item-input';

const track: PlaylistSearchItem = {
  key: 'track:t1',
  itemType: 'track',
  title: 'A',
  artistName: 'x',
  coverArt: null,
  duration: 1,
  source: { trackFileId: 't1', releaseId: 'r1' },
};
const video: PlaylistSearchItem = {
  key: 'video:v1',
  itemType: 'video',
  title: 'B',
  artistName: null,
  coverArt: null,
  duration: null,
  source: { videoId: 'v1' },
};

it('builds a track input from a track search item', () => {
  expect(buildAddPlaylistItemInput(track, 'p1', false)).toEqual({
    itemType: 'track',
    trackFileId: 't1',
    playlistId: 'p1',
    force: false,
  });
});
it('builds a video input from a video search item', () => {
  expect(buildAddPlaylistItemInput(video, 'p1', true)).toEqual({
    itemType: 'video',
    videoId: 'v1',
    playlistId: 'p1',
    force: true,
  });
});
