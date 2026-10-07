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
    ['https://soundcloud.com/margueriteash', 'soundcloud'],
    ['https://music.apple.com/us/artist/marguerite-ash/1', 'apple-music'],
    ['https://bsky.app/profile/margueriteash.example.com', 'bluesky'],
    ['https://www.threads.net/@margueriteash', 'threads'],
    ['https://www.threads.com/@margueriteash', 'threads'],
    ['https://www.patreon.com/margueriteash', 'patreon'],
  ])('%s is %s', (url, platform) => {
    expect(socialPlatformFromUrl(url)).toBe(platform);
  });

  it('matches the host at a dot boundary, so a look-alike host is not a platform', () => {
    expect(socialPlatformFromUrl('https://notinstagram.com/x')).toBeNull();
    expect(socialPlatformFromUrl('https://instagram.com.example.org/x')).toBeNull();
  });

  it('is Apple Music only for the music host, not for apple.com at large', () => {
    expect(socialPlatformFromUrl('https://www.apple.com/music/')).toBeNull();
  });

  it('is null for a host nobody recognises', () => {
    expect(socialPlatformFromUrl('https://unknown-host.example.org/marguerite')).toBeNull();
  });

  it('is null for anything that is not a URL', () => {
    expect(socialPlatformFromUrl('instagram')).toBeNull();
    expect(socialPlatformFromUrl('')).toBeNull();
  });
});
