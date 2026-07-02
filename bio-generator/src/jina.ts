/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { fetchWithRetry } from './lib/http.js';
import { logEvent, toErrorMessage } from './lib/log.js';
import { isListeningServiceUrl } from './listening-services.js';

import type { FetchRetryOptions } from './lib/http.js';

type FetchFn = typeof fetch;

/** Options for {@link searchArtistSources}: retry tuning plus an optional custom query string. */
export interface SearchArtistOptions extends FetchRetryOptions {
  /** Custom search query; defaults to `"<name> musician biography career discography"`. */
  query?: string;
}

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
/** Upper bound on scraped image candidates returned per call. */
const MAX_SCRAPED_IMAGES = 20;

/** An images-summary map: `"Image N[,M][: alt]"` keys to absolute image URLs. */
type JinaImagesSummary = Record<string, string>;

/** Subset of the Jina search response we read (`s.jina.ai`, JSON mode). */
interface JinaSearchResponse {
  data?: Array<{
    title?: string;
    url?: string;
    content?: string;
    description?: string;
    images?: JinaImagesSummary;
  }>;
}

/** Subset of the Jina reader response we read (`r.jina.ai`, JSON mode). */
interface JinaReaderResponse {
  data?: { title?: string; url?: string; content?: string; images?: JinaImagesSummary };
}

/** An image scraped from a grounding page, kept with its provenance. */
export interface ScrapedImage {
  url: string;
  /** Alt/caption text from the page, when the page named the image. */
  alt: string | null;
  /** The page the image was found on. */
  sourceUrl: string;
}

export interface WebSearchSources {
  /** Concatenated readable content from the top results, capped. */
  sourceText: string;
  /** Provenance URLs, for the LLM to weave in as inline links. */
  sourceUrls: string[];
  /** Filtered artist-image candidates scraped from the result pages. */
  images: ScrapedImage[];
  /** Each result's URL and page title for labeling discovered links. */
  references: Array<{ url: string; title: string | null }>;
}

/** The reader result: cleaned page content plus any scraped page images. */
export interface ReadUrlResult {
  content: string;
  images: ScrapedImage[];
}

/**
 * JSON Accept + optional bearer auth (Jina works keyless at a lower rate limit).
 * Every call also asks for the page's images summary so artist photos can be
 * scraped from the same pages that ground the prose.
 */
const jinaHeaders = (apiKey?: string | null): Record<string, string> => {
  const headers: Record<string, string> = {
    Accept: 'application/json',
    'X-With-Images-Summary': 'true',
  };
  if (apiKey) headers.Authorization = `Bearer ${apiKey}`;
  return headers;
};

/**
 * URL fragments that mark site chrome rather than photos (logos, favicons,
 * wordmarks, decorative sprites, commenter avatars).
 */
const JUNK_IMAGE_URL_PATTERN =
  /logo|icon|sprite|badge|wordmark|tagline|emoji|spacer|avatar|placeholder/i;

/** Non-photographic extensions (vector art, animations, favicons). */
const NON_PHOTO_EXTENSION_PATTERN = /\.(svg|gif|ico)$/i;

/** True when the URL plausibly points at a hosted photograph. */
const isPlausiblePhotoUrl = (url: string): boolean => {
  if (!/^https?:\/\//i.test(url)) return false;
  // Quotes/whitespace mark scraping artifacts (e.g. an onerror handler's
  // `this.src='…'` captured mid-attribute), never a real image URL.
  if (/["'\s]/.test(url)) return false;
  if (JUNK_IMAGE_URL_PATTERN.test(url)) return false;
  const path = url.split(/[?#]/)[0];
  return !NON_PHOTO_EXTENSION_PATTERN.test(path);
};

/** Extracts the alt text from an images-summary key like `"Image 4,1: Alt"`. */
const altFromImageKey = (key: string): string | null => {
  const alt = key.replace(/^Image [\d,\s]+:?\s*/, '').trim();
  return alt || null;
};

/**
 * Maps a page's images summary to filtered {@link ScrapedImage} candidates,
 * dropping site chrome and non-photo formats.
 */
const collectPageImages = (
  images: JinaImagesSummary | undefined,
  sourceUrl: string
): ScrapedImage[] =>
  Object.entries(images ?? {})
    .filter(([, url]) => isPlausiblePhotoUrl(url))
    .map(([key, url]) => ({ url, alt: altFromImageKey(key), sourceUrl }));

/** Dedupes scraped images by URL, keeping first occurrence, capped. */
const dedupeScrapedImages = (images: ScrapedImage[]): ScrapedImage[] => {
  const seen = new Set<string>();
  return images
    .filter((image) => {
      const key = image.url.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, MAX_SCRAPED_IMAGES);
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
  options: SearchArtistOptions = {}
): Promise<WebSearchSources | null> => {
  const { query = `${artistName} musician biography career discography`, ...retryOptions } =
    options;
  try {
    const response = await fetchWithRetry(
      `${JINA_SEARCH_ENDPOINT}?q=${encodeURIComponent(query)}`,
      { headers: jinaHeaders(apiKey) },
      { ...retryOptions, fetchFn }
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
        title: result.title,
        text: (result.content || result.description || '').trim(),
        images: result.images,
      }))
      .filter(
        (
          result
        ): result is {
          url: string;
          title: string | undefined;
          text: string;
          images: JinaImagesSummary | undefined;
        } => Boolean(result.url && result.text)
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
    const references = results.map((result) => ({
      url: result.url,
      title: result.title?.trim() || null,
    }));
    // Streaming pages flood the summary with album art, never artist photos.
    const images = dedupeScrapedImages(
      results
        .filter((result) => !isListeningServiceUrl(result.url))
        .flatMap((result) => collectPageImages(result.images, result.url))
    );

    return { sourceText, sourceUrls, references, images };
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
 * @returns The cleaned content (capped) plus scraped page images, or `null`.
 */
export const readUrl = async (
  url: string,
  apiKey?: string | null,
  fetchFn: FetchFn = fetch,
  options: FetchRetryOptions = {}
): Promise<ReadUrlResult | null> => {
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
    if (!content) return null;
    return {
      content: content.slice(0, MAX_READER_CHARS),
      images: dedupeScrapedImages(collectPageImages(body.data?.images, url)),
    };
  } catch (err) {
    logEvent('warn', 'jina_read_error', { url, error: toErrorMessage(err) });
    return null;
  }
};
