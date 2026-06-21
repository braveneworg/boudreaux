/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { isListeningServiceUrl } from './is-listening-service-url';

describe('isListeningServiceUrl', () => {
  it.each([
    'https://open.spotify.com/artist/123',
    'https://spotify.com/artist/123',
    'https://soundcloud.com/some-artist',
    'https://music.apple.com/us/artist/x/123',
    'https://itunes.apple.com/us/artist/x/123',
    'https://some-artist.bandcamp.com/album/x',
    'https://bandcamp.com/x',
    'https://music.youtube.com/channel/x',
    'https://tidal.com/browse/artist/123',
    'https://www.deezer.com/en/artist/123',
    'https://music.amazon.com/artists/x',
  ])('flags listening-service URL %s', (url) => {
    expect(isListeningServiceUrl(url)).toBe(true);
  });

  it.each([
    'https://en.wikipedia.org/wiki/Radiohead',
    'https://radiohead.com',
    'https://www.theguardian.com/music/radiohead',
    'https://musicbrainz.org/artist/123',
    'https://www.youtube.com/watch?v=abc',
  ])('does not flag informative URL %s', (url) => {
    expect(isListeningServiceUrl(url)).toBe(false);
  });

  it('returns false for a non-URL string', () => {
    expect(isListeningServiceUrl('not a url')).toBe(false);
  });
});
