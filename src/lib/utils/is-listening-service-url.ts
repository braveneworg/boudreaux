/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Hostnames (registrable domain or specific subdomain) of streaming/listening
 * services. A bio links out to *informative* sources only — never to a place
 * that drops the reader into another listening experience. `bandcamp.com` is a
 * registrable-domain entry so per-artist subdomains (`artist.bandcamp.com`) are
 * caught; `music.apple.com`/`music.youtube.com`/`music.amazon.com` are pinned
 * to the music subdomain so the parent domains stay allowed for editorial pages.
 */
const LISTENING_SERVICE_HOSTS = [
  'spotify.com',
  'soundcloud.com',
  'music.apple.com',
  'itunes.apple.com',
  'bandcamp.com',
  'music.youtube.com',
  'music.amazon.com',
  'tidal.com',
  'deezer.com',
  'audiomack.com',
  'mixcloud.com',
  'pandora.com',
  'napster.com',
  'qobuz.com',
  'beatport.com',
];

/**
 * True when `url` points at a streaming/listening service that should never
 * appear in a generated bio (inline link or discovered-links list). Matches the
 * host exactly or as a subdomain; unparseable input is treated as not a service.
 *
 * @param url - The candidate URL.
 * @returns Whether the URL targets a listening service.
 */
export const isListeningServiceUrl = (url: string): boolean => {
  let host: string;
  try {
    host = new URL(url).hostname.toLowerCase().replace(/^www\./, '');
  } catch {
    return false;
  }
  return LISTENING_SERVICE_HOSTS.some(
    (service) => host === service || host.endsWith(`.${service}`)
  );
};
