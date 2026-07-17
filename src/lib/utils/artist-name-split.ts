/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/** One artist name parsed out of a free-text video artist string. */
export interface SplitArtistName {
  name: string;
  role: 'primary' | 'featured';
}

/**
 * Matches a featuring separator as its own word: `feat`/`ft` (dot optional),
 * `featuring`, or `w/ ` (case-insensitive), optionally preceded by an opening
 * `(`/`[`. The leading `\b` blocks mid-word hits ("Featurecast", "Daft");
 * `w/` requires trailing whitespace so `w/o` never splits. Ambiguous joiners
 * (`&`, `x`, `,`, `+`) are still never split on here — see
 * {@link splitNameCandidates} for the candidates-only path.
 */
const FEAT_SEPARATOR = /\s*[([]?\s*(?:\b(?:feat|ft)\.?\s+|\bfeaturing\s+|\bw\/\s+)/gi;

/**
 * Joiners that MAY separate multiple artists (also live inside band names).
 * The `i` flag makes the ` x ` joiner case-insensitive; `g` is harmless here
 * ({@link String.prototype.split} ignores it) and kept only for consistency.
 */
const NAME_CANDIDATE_SEPARATOR = /\s*,\s*|\s+&\s+|\s+x\s+/gi;

/** Strip a trailing `)`/`]` left behind when the token was bracket-wrapped, then trim. */
const cleanSegment = (segment: string): string => segment.replace(/[)\]]+\s*$/, '').trim();

/**
 * Split a free-text artist string into one primary name plus featured names.
 * Splits ONLY on word-boundary feat./ft./featuring tokens; dedupes names
 * case-insensitively (first occurrence wins); a string that *starts* with a
 * feat token (empty primary) is returned whole as a single primary; blank
 * input yields an empty array.
 */
export const splitFeaturedArtists = (artist: string): SplitArtistName[] => {
  const raw = artist.trim();
  if (raw === '') return [];

  const [primary, ...featured] = raw.split(FEAT_SEPARATOR).map(cleanSegment);
  if (!primary) return [{ name: raw, role: 'primary' }];

  const seen = new Set<string>([primary.toLowerCase()]);
  const result: SplitArtistName[] = [{ name: primary, role: 'primary' }];

  for (const name of featured) {
    const key = name.toLowerCase();
    if (name !== '' && !seen.has(key)) {
      seen.add(key);
      result.push({ name, role: 'featured' });
    }
  }

  return result;
};

/**
 * Compose a primary artist plus featured names into the canonical
 * `Video.artist` string. Each featured name gets its own ` feat. ` token so
 * the result round-trips exactly through {@link splitFeaturedArtists} (which
 * splits only on feat/ft/featuring tokens, never commas). Blank primary yields
 * an empty string; blank featured entries are dropped.
 */
export const composeArtistString = (primary: string, featured: string[]): string => {
  const base = primary.trim();
  if (base === '') return '';
  const extras = featured.map((name) => name.trim()).filter((name) => name !== '');
  return extras.reduce((acc, name) => `${acc} feat. ${name}`, base);
};

/**
 * Candidate multi-artist split of one name on `", "`, `" & "`, or `" x "`.
 * Returns the trimmed parts when there are 2+, else `[]`. Candidates only:
 * the canonical splitter never uses this (a legit band name may contain the
 * joiner), so callers must surface the split for explicit review.
 */
export const splitNameCandidates = (name: string): string[] => {
  const parts = name
    .split(NAME_CANDIDATE_SEPARATOR)
    .map((part) => part.trim())
    .filter((part) => part !== '');
  return parts.length > 1 ? parts : [];
};
