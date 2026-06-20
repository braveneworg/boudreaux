/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

type FetchFn = typeof fetch;

const TAVILY_ENDPOINT = 'https://api.tavily.com/search';

/** Number of search results to pull content from. */
const MAX_RESULTS = 5;
/** Upper bound on combined source text, to keep the LLM prompt token cost bounded. */
const MAX_SOURCE_CHARS = 14_000;

/** Subset of the Tavily search response we read. */
interface TavilyResponse {
  results?: Array<{ title?: string; url?: string; content?: string; raw_content?: string }>;
}

export interface WebSearchSources {
  /** Concatenated readable content from the top results, capped. */
  sourceText: string;
  /** Provenance URLs, for the LLM to weave in as inline links. */
  sourceUrls: string[];
}

/**
 * Searches the web for biographical material about an artist via Tavily and
 * returns assembled source text plus provenance URLs. Tavily extracts readable
 * page content directly, so no separate scraper is required. This is the
 * fallback grounding source used only when MusicBrainz/Wikipedia yield nothing.
 *
 * @param artistName - The artist display/real name to search for.
 * @param apiKey - Tavily API key (resolved from SSM).
 * @param fetchFn - Injectable fetch (defaults to global) for testability.
 * @returns Assembled sources, or `null` when the search fails or finds nothing
 * usable — callers degrade to a facts-only bio.
 */
export const searchArtistSources = async (
  artistName: string,
  apiKey: string,
  fetchFn: FetchFn = fetch
): Promise<WebSearchSources | null> => {
  try {
    const response = await fetchFn(TAVILY_ENDPOINT, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        query: `${artistName} musician biography career discography`,
        search_depth: 'advanced',
        max_results: MAX_RESULTS,
        include_raw_content: true,
      }),
    });

    if (!response.ok) return null;

    const body = (await response.json()) as TavilyResponse;
    const results = (body.results ?? [])
      .map((result) => ({
        url: result.url,
        text: (result.raw_content || result.content || '').trim(),
      }))
      .filter((result): result is { url: string; text: string } =>
        Boolean(result.url && result.text)
      );

    if (!results.length) return null;

    const sourceText = results
      .map((result) => result.text)
      .join('\n\n')
      .slice(0, MAX_SOURCE_CHARS)
      .trim();
    const sourceUrls = [...new Set(results.map((result) => result.url))];

    return { sourceText, sourceUrls };
  } catch {
    return null;
  }
};
