/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Most tokens a search query contributes to a database filter. Each token adds
 * one OR block (with a relation sub-filter on some searches), so the cap bounds
 * the query a single request can build.
 */
export const MAX_SEARCH_TOKENS = 8;

/** Anything that is not a letter or a digit, at either edge of a token. */
const EDGE_PUNCTUATION = /^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu;

/**
 * Split a free-text search query into the tokens a repository matches
 * individually — every token must match some field, but different tokens may
 * match different fields, so "john smith" finds firstName "John" + surname
 * "Smith", which no whole-string `contains` ever could.
 *
 * Tokens are whitespace-separated and lose punctuation at their edges only
 * ("Q." → "Q", "Jr." → "Jr", while "D.J." → "D.J" and "O'Brien" stay
 * matchable against the stored value). Punctuation-only tokens and
 * case-insensitive repeats are dropped, and the list is capped at
 * {@link MAX_SEARCH_TOKENS}.
 *
 * @param query - The raw (already length-limited) search string.
 * @returns The distinct tokens in query order; empty when nothing is searchable.
 */
export const tokenizeSearchQuery = (query: string): string[] => {
  const seen = new Set<string>();

  return query
    .split(/\s+/)
    .map((token) => token.replace(EDGE_PUNCTUATION, ''))
    .filter((token) => {
      const key = token.toLowerCase();
      if (!token || seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, MAX_SEARCH_TOKENS);
};
