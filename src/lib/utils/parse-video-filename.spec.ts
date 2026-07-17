/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { parseVideoFilename } from './parse-video-filename';

describe('parseVideoFilename', () => {
  it.each([
    [
      'Alpha - Song (feat. Bravo) [Official Video].mp4',
      { title: 'Song', artist: 'Alpha', featuredArtists: ['Bravo'] },
    ],
    ['Alpha – Song (Lyric Video).webm', { title: 'Song', artist: 'Alpha', featuredArtists: [] }],
    ['Alpha | Song [4K].mp4', { title: 'Song', artist: 'Alpha', featuredArtists: [] }],
    [
      'Alpha feat. Bravo - Song.mp4',
      { title: 'Song', artist: 'Alpha', featuredArtists: ['Bravo'] },
    ],
    [
      'Alpha - Song (feat. Bravo & Charlie).mp4',
      { title: 'Song', artist: 'Alpha', featuredArtists: ['Bravo', 'Charlie'] },
    ],
    ['01 - Alpha - Song.mp4', { title: 'Song', artist: 'Alpha', featuredArtists: [] }],
    ['Alpha_-_Song_1080p_x264.mp4', { title: 'Song', artist: 'Alpha', featuredArtists: [] }],
    [
      'Alpha.Name.-.Song.Title.mp4',
      { title: 'Song Title', artist: 'Alpha Name', featuredArtists: [] },
    ],
    ['Song (Remastered 2011).mp4', { title: 'Song', artist: null, featuredArtists: [] }],
    ['plain-clip.mp4', { title: 'plain-clip', artist: null, featuredArtists: [] }],
  ])('%s', (fileName, expected) => {
    expect(parseVideoFilename(fileName)).toEqual(expected);
  });

  it('keeps the title when every token is decoration', () => {
    const parsed = parseVideoFilename('[HD].mp4');
    expect(parsed.title).not.toBe('');
  });
});
