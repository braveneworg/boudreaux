/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { trackMediaItem, videoMediaItem } from './player-media-item';

describe('trackMediaItem', () => {
  it('builds a track PlaylistSearchItem with a track:<id> key and track source', () => {
    const item = trackMediaItem({
      trackFileId: 't1',
      releaseId: 'r1',
      title: 'Song One',
      artistName: 'Artist One',
      coverArt: 'https://cdn.example.com/cover.jpg',
      duration: 210,
    });

    expect(item).toEqual({
      key: 'track:t1',
      itemType: 'track',
      title: 'Song One',
      artistName: 'Artist One',
      coverArt: 'https://cdn.example.com/cover.jpg',
      duration: 210,
      source: { trackFileId: 't1', releaseId: 'r1' },
    });
  });

  it('preserves null artistName, coverArt, and duration', () => {
    const item = trackMediaItem({
      trackFileId: 't2',
      releaseId: 'r2',
      title: 'Song Two',
      artistName: null,
      coverArt: null,
      duration: null,
    });

    expect(item).toEqual({
      key: 'track:t2',
      itemType: 'track',
      title: 'Song Two',
      artistName: null,
      coverArt: null,
      duration: null,
      source: { trackFileId: 't2', releaseId: 'r2' },
    });
  });
});

describe('videoMediaItem', () => {
  it('builds a video PlaylistSearchItem with a video:<id> key and video source', () => {
    const item = videoMediaItem({
      videoId: 'v1',
      title: 'Video One',
      artistName: 'Artist One',
      coverArt: 'https://cdn.example.com/poster.jpg',
      duration: 300,
    });

    expect(item).toEqual({
      key: 'video:v1',
      itemType: 'video',
      title: 'Video One',
      artistName: 'Artist One',
      coverArt: 'https://cdn.example.com/poster.jpg',
      duration: 300,
      source: { videoId: 'v1' },
    });
  });

  it('preserves null artistName, coverArt, and duration', () => {
    const item = videoMediaItem({
      videoId: 'v2',
      title: 'Video Two',
      artistName: null,
      coverArt: null,
      duration: null,
    });

    expect(item).toEqual({
      key: 'video:v2',
      itemType: 'video',
      title: 'Video Two',
      artistName: null,
      coverArt: null,
      duration: null,
      source: { videoId: 'v2' },
    });
  });
});
