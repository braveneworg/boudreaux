/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { splitFeaturedArtists, splitNameCandidates } from '@/utils/artist-name-split';

/** One filename parsed into prefill-ready pieces. */
export interface ParsedVideoFilename {
  title: string;
  artist: string | null;
  featuredArtists: string[];
}

const FILE_EXTENSION = /\.[^/.]+$/;
/**
 * Bracketed decoration junk: (Official Video), [HD], (Remastered 2011)…
 * Flat alternation only — no nested quantifiers — avoids detect-unsafe-regex.
 * Original brief used nested optionals; expanded here for ESLint compliance
 * with identical behavior (verified against all brief table-test inputs).
 */
const BRACKETED_DECORATION =
  /[([](?:official\s+music\s+video|official\s+video|official\s+audio|official\s+visualizer|music\s+video|lyric\s+video|lyrics|visualizer|audio\s+only|audio|remastered\s+\d{4}|remastered|remaster\s+\d{4}|remaster|explicit|clean|hd|4k|\d{3,4}p|x26[45]|h\.26[45]|h26[45])[)\]]/gi;
/** Bare resolution/codec tokens safe to strip outside brackets. */
const BARE_DECORATION = /\b(?:\d{3,4}p|x26[45]|h26[45])\b/gi;
/** Leading track numbers: `01 - `, `01. `, `1_`. */
const LEADING_TRACK_NUMBER = /^\s*\d{1,3}\s*[-._]\s*/;
/** `Artist - Title` separators: hyphen/en-dash/em-dash/pipe with spaces. */
const ARTIST_TITLE_SEPARATOR = /\s+[-–—|]\s+/;

const collapseWhitespace = (value: string): string => value.replace(/\s+/g, ' ').trim();

/** Underscores always become spaces; dots only when the stem has no spaces. */
const normalizeSeparators = (stem: string): string => {
  const underscored = stem.replace(/_/g, ' ');
  return underscored.includes(' ') ? underscored : underscored.replace(/\./g, ' ');
};

const stripDecorations = (value: string): string =>
  collapseWhitespace(value.replace(BRACKETED_DECORATION, ' ').replace(BARE_DECORATION, ' '));

const dedupeNames = (names: string[]): string[] => {
  const seen = new Set<string>();
  return names.filter((name) => {
    const key = name.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

/** Split one segment into its base name plus exploded feat-clause names. */
const extractFeatured = (segment: string): { base: string; featured: string[] } => {
  const parts = splitFeaturedArtists(segment);
  if (parts.length === 0) return { base: '', featured: [] };
  const [first, ...rest] = parts;
  const featured = rest.flatMap((part) => {
    const candidates = splitNameCandidates(part.name);
    return candidates.length > 0 ? candidates : [part.name];
  });
  return { base: first.name, featured };
};

/**
 * Parse a video file name into prefill pieces: strip the extension, normalize
 * `_`/`.` separators, drop decoration junk and leading track numbers, split
 * `Artist - Title`, and extract feat-clauses from both segments (list-shaped
 * clauses like `feat. A, B & C` explode into individual names — the prefill
 * is fully visible in the form, so aggressive parsing is reviewable).
 */
export const parseVideoFilename = (fileName: string): ParsedVideoFilename => {
  const stem = normalizeSeparators(fileName.replace(FILE_EXTENSION, ''));
  const cleaned = stripDecorations(stem).replace(LEADING_TRACK_NUMBER, '');
  const [left, ...restSegments] = cleaned.split(ARTIST_TITLE_SEPARATOR);

  if (restSegments.length === 0) {
    const { base, featured } = extractFeatured(collapseWhitespace(left));
    const title = base || collapseWhitespace(left) || collapseWhitespace(stem);
    return { title, artist: null, featuredArtists: dedupeNames(featured) };
  }

  const right = restSegments.join(' - ');
  const artistSide = extractFeatured(collapseWhitespace(left));
  const titleSide = extractFeatured(collapseWhitespace(right));
  return {
    title: titleSide.base || collapseWhitespace(right),
    artist: artistSide.base || null,
    featuredArtists: dedupeNames([...artistSide.featured, ...titleSide.featured]),
  };
};
