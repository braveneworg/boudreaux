/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/** A platform the site has a brand icon for. */
export type SocialPlatform =
  | 'facebook'
  | 'instagram'
  | 'youtube'
  | 'bandcamp'
  | 'x'
  | 'tiktok'
  | 'spotify'
  | 'discogs'
  | 'soundcloud'
  | 'apple-music'
  | 'bluesky'
  | 'threads'
  | 'patreon';

/** The hosts of each platform; a subdomain of one matches too. */
const SOCIAL_PLATFORM_HOSTS: ReadonlyArray<readonly [SocialPlatform, readonly string[]]> = [
  ['facebook', ['facebook.com', 'fb.com']],
  ['instagram', ['instagram.com']],
  ['youtube', ['youtube.com', 'youtu.be']],
  ['bandcamp', ['bandcamp.com']],
  ['x', ['x.com', 'twitter.com']],
  ['tiktok', ['tiktok.com']],
  ['spotify', ['spotify.com']],
  ['discogs', ['discogs.com']],
  ['soundcloud', ['soundcloud.com']],
  // Only the music host: apple.com at large is not a listening page.
  ['apple-music', ['music.apple.com']],
  ['bluesky', ['bsky.app']],
  ['threads', ['threads.net', 'threads.com']],
  ['patreon', ['patreon.com']],
];

/**
 * The platform a link points at, by its host (ADR-0020: nothing stored, the
 * icon follows the href), or `null` for any other host or a non-URL. The
 * host matches exactly or at a dot boundary, as the listening-service check
 * does, so `notinstagram.com` is not Instagram.
 */
export const socialPlatformFromUrl = (url: string): SocialPlatform | null => {
  let host: string;
  try {
    host = new URL(url).hostname.toLowerCase().replace(/^www\./, '');
  } catch {
    return null;
  }
  const match = SOCIAL_PLATFORM_HOSTS.find(([, hosts]) =>
    hosts.some((candidate) => host === candidate || host.endsWith(`.${candidate}`))
  );
  return match ? match[0] : null;
};
