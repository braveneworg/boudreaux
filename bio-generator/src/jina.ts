/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { fetchWithRetry } from './lib/http.js';
import { logEvent, toErrorMessage } from './lib/log.js';

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
const MAX_RESULTS = 10;
/** Upper bound on combined search source text, to bound the LLM prompt size. */
const MAX_SOURCE_CHARS = 14_000;
/** Upper bound on a single reader (e.g. official site) extract. */
const MAX_READER_CHARS = 12_000;
/**
 * Upper bound on scraped image candidates returned per Jina call. Raised to 120
 * in Tier 1 to widen the raw scrape pool; the vision candidate limit
 * (`VISION_CANDIDATE_LIMIT`, default 240) is the real global gate applied after
 * all sources are merged — this cap only prevents a single call from dominating.
 */
const MAX_SCRAPED_IMAGES = 120;

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
  data?: {
    title?: string;
    url?: string;
    content?: string;
    images?: JinaImagesSummary;
    /** Set by Jina when the page it rendered looked like a CAPTCHA / bot wall. */
    warning?: string;
  };
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
 * How a reader call ended. `blocked` means the site answered with an anti-bot
 * interstitial (Cloudflare's "Just a moment…", a CAPTCHA wall) instead of the
 * page — Jina renders what it is served and, by policy, never bypasses those.
 * `unreadable` covers everything else that yields no page: a non-OK response,
 * a thrown request, an empty body.
 */
export type ReadUrlOutcome =
  { kind: 'read'; result: ReadUrlResult } | { kind: 'blocked' } | { kind: 'unreadable' };

/** Jina's own flag: it saw a CAPTCHA-like interstitial while rendering. */
const CHALLENGE_WARNING_PATTERN = /captcha/i;
/** Titles the common bot-challenge interstitials render under. */
const CHALLENGE_TITLE_PATTERN =
  /^(just a moment|attention required|access denied|security verification|verifying you are human|one more step)/i;
/** Body copy of those interstitials. */
const CHALLENGE_CONTENT_PATTERN =
  /performing security verification|verify(ing)? (that )?you are (not a bot|human)|checking your browser|enable javascript and cookies to continue/i;
/**
 * An interstitial says almost nothing; a real article that happens to mention
 * a browser check runs far longer. Body copy is only decisive under this size.
 */
const MAX_CHALLENGE_PAGE_CHARS = 1_500;

/** What the challenge detector reads from a rendered reader payload. */
interface ReaderPageSignals {
  title?: string;
  warning?: string;
  content: string;
}

/**
 * True when the reader rendered an anti-bot interstitial rather than the page.
 * Jina's warning and the page title are decisive on their own; body copy only
 * counts on a short page, so an article about CAPTCHAs still reads as a page.
 */
export const isBotChallengePage = ({ title, warning, content }: ReaderPageSignals): boolean => {
  if (warning && CHALLENGE_WARNING_PATTERN.test(warning)) return true;
  if (title && CHALLENGE_TITLE_PATTERN.test(title.trim())) return true;
  return content.length <= MAX_CHALLENGE_PAGE_CHARS && CHALLENGE_CONTENT_PATTERN.test(content);
};

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
export const isPlausiblePhotoUrl = (url: string): boolean => {
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
 * Alt texts that mark page chrome or ads rather than artist photography
 * (logos, icons, flags, avatars, banners, subscription prompts, ads).
 */
const JUNK_IMAGE_ALT_PATTERN =
  /\b(logo|icon|flag|avatar|banner|badge|button|sprite|placeholder|thumbnail|advert(isement)?|ad|sponsor(ed)?|subscription|subscribe|sign[ -]?(up|in)|default profile|profile photo missing|cookie|tracking pixel)\b/i;

/** True when alt text marks page chrome or ads rather than artist photography. */
export const isJunkImageAlt = (alt: string): boolean => JUNK_IMAGE_ALT_PATTERN.test(alt);

/**
 * Maps a page's images summary to filtered {@link ScrapedImage} candidates,
 * dropping site chrome (by URL), non-photo formats, and page-chrome alt text.
 */
const collectPageImages = (
  images: JinaImagesSummary | undefined,
  sourceUrl: string
): ScrapedImage[] =>
  Object.entries(images ?? {})
    .filter(([, url]) => isPlausiblePhotoUrl(url))
    .map(([key, url]) => ({ url, alt: altFromImageKey(key), sourceUrl }))
    .filter(({ alt }) => alt === null || !isJunkImageAlt(alt));

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
    // Listening-service pages are album art — wanted since media v2. Every
    // scraped candidate is subject-verified by the vision pass downstream.
    const images = dedupeScrapedImages(
      results.flatMap((result) => collectPageImages(result.images, result.url))
    );

    return { sourceText, sourceUrls, references, images };
  } catch (err) {
    logEvent('warn', 'jina_search_error', { artist: artistName, error: toErrorMessage(err) });
    return null;
  }
};

/**
 * Reads a single URL into clean markdown via Jina AI Reader (`r.jina.ai`) and
 * says how the read ended — see {@link ReadUrlOutcome}. Callers that must tell
 * an admin *why* a page yielded nothing (a bot wall vs. a dead link) use this;
 * grounding callers use {@link readUrl}, which folds both failures into `null`.
 *
 * @param url - The page to read.
 * @param apiKey - Optional Jina API key (resolved from SSM); higher rate limit.
 * @param fetchFn - Injectable fetch (defaults to global) for testability.
 * @returns The read page (content capped, images filtered), or why there is none.
 */
export const readUrlOutcome = async (
  url: string,
  apiKey?: string | null,
  fetchFn: FetchFn = fetch,
  options: FetchRetryOptions = {}
): Promise<ReadUrlOutcome> => {
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
      return { kind: 'unreadable' };
    }
    return outcomeFromReaderBody((await response.json()) as JinaReaderResponse, url);
  } catch (err) {
    logEvent('warn', 'jina_read_error', { url, error: toErrorMessage(err) });
    return { kind: 'unreadable' };
  }
};

/** Classifies an OK reader payload: empty → unreadable, interstitial → blocked, else read. */
const outcomeFromReaderBody = (body: JinaReaderResponse, url: string): ReadUrlOutcome => {
  const { title, warning, images } = body.data ?? {};
  const content = body.data?.content?.trim();
  if (!content) return { kind: 'unreadable' };
  if (isBotChallengePage({ title, warning, content })) {
    logEvent('warn', 'jina_read_blocked', { url, title: title ?? null });
    return { kind: 'blocked' };
  }
  return {
    kind: 'read',
    result: {
      content: content.slice(0, MAX_READER_CHARS),
      images: dedupeScrapedImages(collectPageImages(images, url)),
    },
  };
};

/**
 * Reads a single URL into clean markdown via Jina AI Reader (`r.jina.ai`). Used
 * to pull high-signal grounding from a known page (e.g. the artist's official
 * site) that search may rank poorly. Best-effort: returns `null` on any failure,
 * including a bot-challenge interstitial, so challenge copy never grounds prose.
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
  const outcome = await readUrlOutcome(url, apiKey, fetchFn, options);
  return outcome.kind === 'read' ? outcome.result : null;
};
