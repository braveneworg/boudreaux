/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

// Adapted from bio-generator/src/lib/http.ts: the two Lambda projects are
// standalone and cannot import each other.

type FetchFn = typeof fetch;

/** Initial attempt + this many retries on a transient (429/503) response. */
const DEFAULT_RETRIES = 3;
/** Base backoff; doubled each attempt and overridden by any `Retry-After`. */
const DEFAULT_BASE_DELAY_MS = 1000;
/** Statuses worth retrying — rate limit / temporarily unavailable. */
const RETRYABLE_STATUSES = new Set([429, 503]);
/**
 * Hard ceiling on a server-provided `Retry-After` delay. The only caller is
 * the completion callback, which runs in the time the run budget leaves before
 * the Lambda's 900s limit, so three capped waits must fit inside that.
 */
export const RETRY_AFTER_MAX_MS = 20_000;

/** Promise-based delay; injectable in callers so tests never wait for real time. */
export const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

/** Tunables for {@link fetchWithRetry}; all optional with production defaults. */
export interface FetchRetryOptions {
  fetchFn?: FetchFn;
  sleep?: (ms: number) => Promise<void>;
  retries?: number;
  baseDelayMs?: number;
}

/** Resolves the backoff delay, preferring a server-provided `Retry-After`. */
const retryAfterMs = (response: Response, fallbackMs: number): number => {
  const header = response.headers.get('retry-after');
  if (!header) {
    return fallbackMs;
  }
  const seconds = Number(header);
  if (!Number.isFinite(seconds)) {
    return fallbackMs;
  }
  return Math.min(seconds * 1000, RETRY_AFTER_MAX_MS);
};

/**
 * Fetches a URL, transparently retrying transient 429/503 responses with
 * exponential backoff that honors a `Retry-After` header. Non-retryable
 * statuses and the final exhausted response are returned as-is — the caller
 * decides whether to throw or degrade.
 *
 * @param url - Request URL.
 * @param init - Standard fetch init (headers, etc.).
 * @param options - Injectable fetch/sleep and retry tuning.
 * @returns The first OK response, or the last response once retries run out.
 */
export const fetchWithRetry = async (
  url: string,
  init: RequestInit,
  options: FetchRetryOptions = {}
): Promise<Response> => {
  const {
    fetchFn = fetch,
    sleep: sleepFn = sleep,
    retries = DEFAULT_RETRIES,
    baseDelayMs = DEFAULT_BASE_DELAY_MS,
  } = options;

  let response = await fetchFn(url, init);
  for (let attempt = 0; attempt < retries; attempt += 1) {
    if (response.ok || !RETRYABLE_STATUSES.has(response.status)) {
      return response;
    }
    await sleepFn(retryAfterMs(response, baseDelayMs * 2 ** attempt));
    response = await fetchFn(url, init);
  }
  return response;
};
