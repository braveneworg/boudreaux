/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/** Longest label the palette renders comfortably on one tile line. */
const MAX_LABEL_LENGTH = 80;

/** Registrable domains → human service names for label fallbacks. */
const SERVICE_HOST_NAMES = new Map<string, string>([
  ['bandcamp.com', 'Bandcamp'],
  ['spotify.com', 'Spotify'],
  ['music.apple.com', 'Apple Music'],
  ['itunes.apple.com', 'Apple Music'],
  ['soundcloud.com', 'SoundCloud'],
  ['youtube.com', 'YouTube'],
  ['music.youtube.com', 'YouTube Music'],
  ['tidal.com', 'Tidal'],
  ['deezer.com', 'Deezer'],
  ['discogs.com', 'Discogs'],
  ['instagram.com', 'Instagram'],
  ['facebook.com', 'Facebook'],
  ['x.com', 'X'],
  ['twitter.com', 'X'],
]);

const hostnameOf = (url: string): string | null => {
  try {
    return new URL(url).hostname.toLowerCase().replace(/^www\./, '');
  } catch {
    return null;
  }
};

const serviceNameFor = (host: string): string | null => {
  for (const [domain, name] of SERVICE_HOST_NAMES) {
    if (host === domain || host.endsWith(`.${domain}`)) return name;
  }
  return null;
};

/**
 * Derives a descriptive palette label for a discovered link: the page title
 * when the source provided one, else "<artist> on <Service>" for known
 * services, else "<artist> — <hostname>". Never a bare hostname or empty.
 */
export const deriveLinkLabel = ({
  title,
  url,
  artistName,
}: {
  title: string | null;
  url: string;
  artistName: string;
}): string => {
  const trimmed = title?.trim();
  if (trimmed) return trimmed.slice(0, MAX_LABEL_LENGTH);
  const host = hostnameOf(url);
  if (!host) return artistName;
  const service = serviceNameFor(host);
  return service ? `${artistName} on ${service}` : `${artistName} — ${host}`;
};

/** Titles that mark editorial coverage rather than a reference page. */
const PRESS_TITLE_PATTERN = /\b(interview|review|feature|profile|press)\b/i;

/** Classifies a search-result reference as press coverage or a plain reference. */
export const classifyReferenceKind = (title: string | null): 'press' | 'other' =>
  title && PRESS_TITLE_PATTERN.test(title) ? 'press' : 'other';
