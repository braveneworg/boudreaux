/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { generateSlug } from '@/lib/utils/generate-slug';
import { splitList } from '@/lib/utils/split-list';

/**
 * Terms whose title-cased form reads wrong. Keyed by the NORMALISED term, so
 * a lookup only ever happens after {@link normalizeVocabularyTerm}.
 */
const VOCABULARY_DISPLAY_OVERRIDES: ReadonlyMap<string, string> = new Map([
  ['lo-fi', 'Lo-Fi'],
  ['hip-hop', 'Hip-Hop'],
  ['r-and-b', 'R&B'],
  ['dnb', 'DnB'],
]);

/**
 * The single storage form for a genre or tag: lowercase and dash-separated.
 *
 * `&` and `+` are spelled out BEFORE slugifying because `generateSlug` strips
 * every non-alphanumeric character — without the pre-map `"R&B"` would store
 * as `"rb"` rather than the `"r-and-b"` the display override expects.
 *
 * Every write path and every read-side grouping must go through this function.
 * If the two ever diverge, the suggestion counts stop matching what is stored.
 *
 * @param value - Raw term as typed or as returned by a generation job.
 * @returns The normalised term, or `''` when nothing usable remains.
 */
export const normalizeVocabularyTerm = (value: string): string =>
  generateSlug(value.replace(/[&+]/g, ' and '));

/**
 * Render a stored term for a human: an explicit override when one exists,
 * otherwise dash→space plus title case. Input is normalised first so a raw
 * `"Hip Hop"` resolves to the same override as a stored `"hip-hop"`.
 *
 * @param value - A stored (or raw) term.
 * @returns The display form, or `''` when nothing usable remains.
 */
export const formatVocabularyTerm = (value: string): string => {
  const normalized = normalizeVocabularyTerm(value);
  const override = VOCABULARY_DISPLAY_OVERRIDES.get(normalized);

  if (override !== undefined) {
    return override;
  }

  return normalized
    .split('-')
    .filter(Boolean)
    .map((word) => `${word.charAt(0).toUpperCase()}${word.slice(1)}`)
    .join(' ');
};

/**
 * Normalise a whole comma-joined column value, dropping duplicates and terms
 * that normalise to nothing while preserving the given order.
 *
 * @param value - The stored comma-joined list, if any.
 * @returns A comma-joined list of normalised terms, or `null` when empty —
 *   `null` rather than `''` so Prisma clears the column instead of storing a
 *   blank string.
 */
export const normalizeVocabularyList = (value: string | null | undefined): string | null => {
  const terms = splitList(value).map(normalizeVocabularyTerm).filter(Boolean);

  return terms.length > 0 ? [...new Set(terms)].join(',') : null;
};
