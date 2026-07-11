/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { isJunkImageAlt, isPlausiblePhotoUrl } from './jina.js';
import { logEvent, toErrorMessage } from './lib/log.js';

import type { ScrapedImage } from './jina.js';

type FetchFn = typeof fetch;

/** Serper.dev Google-Images search endpoint (POST, JSON body). */
const SERPER_IMAGES_ENDPOINT = 'https://google.serper.dev/images';

/**
 * Upper bound on kept image candidates per query, so a single query cannot
 * dominate the merged pool. The global vision-candidate gate (applied after all
 * sources merge) is the real limiter — this only caps one query's contribution.
 */
export const MAX_SERPER_IMAGES_PER_QUERY = 40;

/** Subset of the Serper images response we read. */
interface SerperImagesResponse {
  images?: Array<{ imageUrl?: string; title?: string; link?: string }>;
}

/** The four targeted image queries run per artist. */
const buildQueries = (artistName: string): string[] => [
  `${artistName} musician press photo`,
  `${artistName} live performance`,
  `${artistName} band portrait`,
  `${artistName} album cover`,
];

/**
 * Maps one Serper image result to a {@link ScrapedImage}, or `null` when it
 * should be dropped: a missing image URL or provenance link, a non-photo/chrome
 * URL, or page-chrome alt text. Whitespace-only titles map to a null alt.
 */
const toScrapedImage = (image: {
  imageUrl?: string;
  title?: string;
  link?: string;
}): ScrapedImage | null => {
  const { imageUrl, title, link } = image;
  if (!imageUrl || !link) return null;
  if (!isPlausiblePhotoUrl(imageUrl)) return null;
  const alt = title?.trim() || null;
  if (alt !== null && isJunkImageAlt(alt)) return null;
  return { url: imageUrl, alt, sourceUrl: link };
};

/**
 * Runs a single Serper images query. Best-effort: a non-ok response or a thrown
 * fetch logs a warning and yields an empty list rather than throwing, so one
 * failed query never aborts the others.
 */
const runQuery = async (
  query: string,
  apiKey: string,
  fetchFn: FetchFn
): Promise<ScrapedImage[]> => {
  try {
    const response = await fetchFn(SERPER_IMAGES_ENDPOINT, {
      method: 'POST',
      headers: { 'X-API-KEY': apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({ q: query }),
    });
    if (!response.ok) {
      logEvent('warn', 'serper_query_failed', { status: response.status });
      return [];
    }
    const body = (await response.json()) as SerperImagesResponse;
    return (body.images ?? [])
      .map(toScrapedImage)
      .filter((image): image is ScrapedImage => image !== null)
      .slice(0, MAX_SERPER_IMAGES_PER_QUERY);
  } catch (err) {
    logEvent('warn', 'serper_query_failed', { error: toErrorMessage(err) });
    return [];
  }
};

/**
 * Searches Google Images via Serper.dev for artist photos, running four
 * targeted queries (press photo, live performance, band portrait, album cover)
 * sequentially and merging their results. Each result is filtered through the
 * shared Jina junk heuristics (URL plausibility + alt-text chrome), capped per
 * query, and deduped by lowercased URL across queries (first occurrence wins).
 *
 * Best-effort and key-gated: a failing query is skipped; if every query fails
 * or yields nothing, returns `null`. Never throws.
 *
 * @param artistName - The artist display/real name to search for.
 * @param apiKey - The Serper.dev API key (required; resolved from SSM).
 * @param fetchFn - Injectable fetch (defaults to global) for testability.
 * @returns The merged, deduped image candidates, or `null` when none were found.
 */
export const searchSerperImages = async (
  artistName: string,
  apiKey: string,
  fetchFn: FetchFn = fetch
): Promise<ScrapedImage[] | null> => {
  const seen = new Set<string>();
  const merged: ScrapedImage[] = [];
  for (const query of buildQueries(artistName)) {
    const found = await runQuery(query, apiKey, fetchFn);
    for (const image of found) {
      const key = image.url.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      merged.push(image);
    }
  }

  if (!merged.length) return null;
  logEvent('info', 'serper_images', { count: merged.length });
  return merged;
};
