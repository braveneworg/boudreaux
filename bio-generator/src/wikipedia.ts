/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { USER_AGENT } from './types.js';

type FetchFn = typeof fetch;

/** Upper bound on extract length fed to the LLM, to keep the prompt token cost bounded. */
const MAX_EXTRACT_CHARS = 16_000;

/** Minimal shape of the Action API `prop=extracts` response we read. */
interface WikipediaQueryResponse {
  query?: {
    pages?: Record<string, { title?: string; extract?: string; missing?: string }>;
  };
}

export interface WikipediaExtract {
  title: string;
  extract: string;
  url: string;
}

/**
 * Parses the article title out of a canonical `/wiki/<Title>` Wikipedia URL,
 * decoding percent-encoding and converting underscores to spaces.
 *
 * @param wikipediaUrl - A full Wikipedia article URL.
 * @returns The human-readable title, or `null` when the URL is not an article.
 */
export const titleFromWikipediaUrl = (wikipediaUrl: string): string | null => {
  try {
    const { pathname } = new URL(wikipediaUrl);
    const match = pathname.match(/^\/wiki\/(.+)$/);
    if (!match) return null;
    return decodeURIComponent(match[1]).replace(/_/g, ' ');
  } catch {
    return null;
  }
};

/** Truncates at the last paragraph break before the cap so prose stays coherent. */
const truncateExtract = (extract: string): string => {
  if (extract.length <= MAX_EXTRACT_CHARS) return extract;
  const head = extract.slice(0, MAX_EXTRACT_CHARS);
  const lastBreak = head.lastIndexOf('\n');
  return (lastBreak > MAX_EXTRACT_CHARS / 2 ? head.slice(0, lastBreak) : head).trim();
};

/**
 * Fetches the full plain-text body of a Wikipedia article via the Action API
 * (`prop=extracts&explaintext`). This is the primary grounding source: the LLM
 * rewrites it into an original, encyclopedic bio rather than being handed only a
 * bare URL. Queries the same language host as the source URL so non-English
 * articles resolve correctly.
 *
 * @param wikipediaUrl - The article URL resolved from Wikidata/MusicBrainz.
 * @param fetchFn - Injectable fetch (defaults to global) for testability.
 * @returns The title/extract/url, or `null` when the title is unparseable, the
 * page is missing, or the request fails — callers degrade to other sources.
 */
export const getWikipediaExtract = async (
  wikipediaUrl: string,
  fetchFn: FetchFn = fetch
): Promise<WikipediaExtract | null> => {
  const title = titleFromWikipediaUrl(wikipediaUrl);
  if (!title) return null;

  const { origin } = new URL(wikipediaUrl);
  const params = new URLSearchParams({
    action: 'query',
    format: 'json',
    prop: 'extracts',
    explaintext: '1',
    redirects: '1',
    titles: title,
  });
  const apiUrl = `${origin}/w/api.php?${params.toString()}`;

  const response = await fetchFn(apiUrl, {
    headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
  });
  if (!response.ok) return null;

  const body = (await response.json()) as WikipediaQueryResponse;
  const page = Object.values(body.query?.pages ?? {})[0];
  if (!page || page.missing !== undefined) return null;

  const extract = page.extract?.trim();
  if (!extract) return null;

  return {
    title: page.title ?? title,
    extract: truncateExtract(extract),
    url: wikipediaUrl,
  };
};
