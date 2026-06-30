/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { fetchWithRetry } from './lib/http.js';
import { logEvent, toErrorMessage } from './lib/log.js';

import type { FetchRetryOptions } from './lib/http.js';

type FetchFn = typeof fetch;

/** Jina AI search — returns ranked results with clean, readable page content. */
const JINA_SEARCH_ENDPOINT = 'https://s.jina.ai/';
/** Jina AI Reader — returns a single URL rendered to clean markdown. */
const JINA_READER_ENDPOINT = 'https://r.jina.ai/';

/** Number of search results to pull content from. */
const MAX_RESULTS = 5;
/** Upper bound on combined search source text, to bound the LLM prompt size. */
const MAX_SOURCE_CHARS = 14_000;
/** Upper bound on a single reader (e.g. official site) extract. */
const MAX_READER_CHARS = 12_000;

/** Subset of the Jina search response we read (`s.jina.ai`, JSON mode). */
interface JinaSearchResponse {
  data?: Array<{ title?: string; url?: string; content?: string; description?: string }>;
}

/** Subset of the Jina reader response we read (`r.jina.ai`, JSON mode). */
interface JinaReaderResponse {
  data?: { title?: string; url?: string; content?: string };
}

export interface WebSearchSources {
  /** Concatenated readable content from the top results, capped. */
  sourceText: string;
  /** Provenance URLs, for the LLM to weave in as inline links. */
  sourceUrls: string[];
}

/** JSON Accept + optional bearer auth (Jina works keyless at a lower rate limit). */
const jinaHeaders = (apiKey?: string | null): Record<string, string> => {
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (apiKey) headers.Authorization = `Bearer ${apiKey}`;
  return headers;
};

/**
 * Searches the web for biographical material about an artist via Jina AI Search
 * (`s.jina.ai`), which returns ranked results with cleaned, readable page
 * content (markdown) — sharper grounding than raw scraped HTML. Best-effort:
 * returns `null` on failure or no usable content so callers degrade to a
 * facts-only bio.
 *
 * @param artistName - The artist display/real name to search for.
 * @param apiKey - Optional Jina API key (resolved from SSM); higher rate limit.
 * @param fetchFn - Injectable fetch (defaults to global) for testability.
 * @returns Assembled sources, or `null` when the search fails or finds nothing.
 */
export const searchArtistSources = async (
  artistName: string,
  apiKey?: string | null,
  fetchFn: FetchFn = fetch,
  options: FetchRetryOptions = {}
): Promise<WebSearchSources | null> => {
  try {
    const query = `${artistName} musician biography career discography`;
    const response = await fetchWithRetry(
      `${JINA_SEARCH_ENDPOINT}?q=${encodeURIComponent(query)}`,
      { headers: jinaHeaders(apiKey) },
      { ...options, fetchFn }
    );

    if (!response.ok) {
      logEvent('warn', 'jina_search_failed', {
        artist: artistName,
        status: response.status,
        keyed: Boolean(apiKey),
      });
      return null;
    }

    const body = (await response.json()) as JinaSearchResponse;
    const results = (body.data ?? [])
      .slice(0, MAX_RESULTS)
      .map((result) => ({
        url: result.url,
        text: (result.content || result.description || '').trim(),
      }))
      .filter((result): result is { url: string; text: string } =>
        Boolean(result.url && result.text)
      );

    if (!results.length) {
      logEvent('warn', 'jina_search_empty', { artist: artistName });
      return null;
    }

    const sourceText = results
      .map((result) => result.text)
      .join('\n\n')
      .slice(0, MAX_SOURCE_CHARS)
      .trim();
    const sourceUrls = [...new Set(results.map((result) => result.url))];

    return { sourceText, sourceUrls };
  } catch (err) {
    logEvent('warn', 'jina_search_error', { artist: artistName, error: toErrorMessage(err) });
    return null;
  }
};

/**
 * Reads a single URL into clean markdown via Jina AI Reader (`r.jina.ai`). Used
 * to pull high-signal grounding from a known page (e.g. the artist's official
 * site) that search may rank poorly. Best-effort: returns `null` on any failure.
 *
 * @param url - The page to read.
 * @param apiKey - Optional Jina API key (resolved from SSM); higher rate limit.
 * @param fetchFn - Injectable fetch (defaults to global) for testability.
 * @returns The cleaned content (capped), or `null` when unavailable.
 */
export const readUrl = async (
  url: string,
  apiKey?: string | null,
  fetchFn: FetchFn = fetch,
  options: FetchRetryOptions = {}
): Promise<string | null> => {
  try {
    const response = await fetchWithRetry(
      `${JINA_READER_ENDPOINT}${url}`,
      { headers: jinaHeaders(apiKey) },
      { ...options, fetchFn }
    );
    if (!response.ok) {
      logEvent('warn', 'jina_read_failed', {
        url,
        status: response.status,
        keyed: Boolean(apiKey),
      });
      return null;
    }

    const body = (await response.json()) as JinaReaderResponse;
    const content = body.data?.content?.trim();
    return content ? content.slice(0, MAX_READER_CHARS) : null;
  } catch (err) {
    logEvent('warn', 'jina_read_error', { url, error: toErrorMessage(err) });
    return null;
  }
};
