/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { isListeningServiceUrl } from './listening-services.js';

describe('isListeningServiceUrl', () => {
  it.each([
    'https://open.spotify.com/artist/1',
    'https://soundcloud.com/x',
    'https://music.apple.com/us/artist/x/1',
    'https://x.bandcamp.com/album/y',
    'https://music.youtube.com/channel/x',
    'https://tidal.com/browse/artist/1',
  ])('flags %s', (url) => {
    expect(isListeningServiceUrl(url)).toBe(true);
  });

  it.each([
    'https://en.wikipedia.org/wiki/Radiohead',
    'https://radiohead.com',
    'https://www.youtube.com/watch?v=abc',
  ])('does not flag %s', (url) => {
    expect(isListeningServiceUrl(url)).toBe(false);
  });

  it('returns false for a non-URL', () => {
    expect(isListeningServiceUrl('nope')).toBe(false);
  });
});
