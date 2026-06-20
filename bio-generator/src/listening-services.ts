/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Hostnames of streaming/listening services. A generated bio links out to
 * *informative* sources only — never to a place that drops the reader into
 * another listening experience. Mirrored in the web app
 * (`src/lib/utils/is-listening-service-url.ts`); the two projects cannot share a
 * module. `bandcamp.com` is a registrable-domain entry so per-artist subdomains
 * (`artist.bandcamp.com`) are caught.
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
 * True when `url` targets a streaming/listening service. Matches the host
 * exactly or as a subdomain; unparseable input is treated as not a service.
 *
 * @param url - The candidate URL.
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
