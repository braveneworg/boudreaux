/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/** Sliding-window size: 8 consecutive normalized words shared with a source
 * marks copied phrasing — long enough to skip idioms, short enough to catch
 * lifted sentences. */
const DEFAULT_SHINGLE_SIZE = 8;

export interface PlagiarismSegment {
  /** The normalized overlapping run, for the repair prompt to target. */
  text: string;
}

/** Strips tags, lowercases, drops punctuation, splits to words. */
const normalizeWords = (text: string): string[] =>
  text
    .replace(/<[^>]+>/g, ' ')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .filter(Boolean);

const shingleAt = (words: string[], start: number, size: number): string =>
  words.slice(start, start + size).join(' ');

/** Builds the set of all `shingleSize`-word n-grams from every source text. */
const buildShingleSet = (sources: string[], shingleSize: number): Set<string> => {
  const set = new Set<string>();
  for (const source of sources) {
    const words = normalizeWords(source);
    for (let i = 0; i + shingleSize <= words.length; i += 1) {
      set.add(shingleAt(words, i, shingleSize));
    }
  }
  return set;
};

/**
 * Finds runs of the output that reproduce `shingleSize` consecutive words from
 * any source text. Overlapping/adjacent matches merge into one segment.
 */
export const findPlagiarizedSegments = (
  output: string,
  sources: string[],
  shingleSize: number = DEFAULT_SHINGLE_SIZE
): PlagiarismSegment[] => {
  const sourceShingles = buildShingleSet(sources, shingleSize);
  if (!sourceShingles.size) return [];

  const words = normalizeWords(output);
  const segments: PlagiarismSegment[] = [];
  let runStart = -1;
  let runEnd = -1;
  for (let i = 0; i + shingleSize <= words.length; i += 1) {
    if (sourceShingles.has(shingleAt(words, i, shingleSize))) {
      if (runStart === -1) runStart = i;
      runEnd = i + shingleSize;
    } else if (runStart !== -1 && i >= runEnd) {
      segments.push({ text: words.slice(runStart, runEnd).join(' ') });
      runStart = -1;
    }
  }
  if (runStart !== -1) segments.push({ text: words.slice(runStart, runEnd).join(' ') });
  return segments;
};
