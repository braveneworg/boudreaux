/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { socialPlatformFromUrl } from './social-platform-from-url';

describe('socialPlatformFromUrl', () => {
  it.each([
    ['https://www.instagram.com/margueriteash', 'instagram'],
    ['https://facebook.com/fakefourinc', 'facebook'],
    ['https://www.youtube.com/@margueriteash', 'youtube'],
    ['https://youtu.be/abc123', 'youtube'],
    ['https://margueriteash.bandcamp.com', 'bandcamp'],
    ['https://x.com/margueriteash', 'x'],
    ['https://twitter.com/margueriteash', 'x'],
    ['https://www.tiktok.com/@margueriteash', 'tiktok'],
    ['https://open.spotify.com/artist/0000000000', 'spotify'],
    ['https://www.discogs.com/artist/0000-Marguerite-Ash', 'discogs'],
  ])('%s is %s', (url, platform) => {
    expect(socialPlatformFromUrl(url)).toBe(platform);
  });

  it('matches the host at a dot boundary, so a look-alike host is not a platform', () => {
    expect(socialPlatformFromUrl('https://notinstagram.com/x')).toBeNull();
    expect(socialPlatformFromUrl('https://instagram.com.example.org/x')).toBeNull();
  });

  it('is null for a host nobody recognises', () => {
    expect(socialPlatformFromUrl('https://unknown-host.example.org/marguerite')).toBeNull();
  });

  it('is null for anything that is not a URL', () => {
    expect(socialPlatformFromUrl('instagram')).toBeNull();
    expect(socialPlatformFromUrl('')).toBeNull();
  });
});
