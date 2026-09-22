/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { HttpError } from './fetch-and-parse';

/** How many times a query is re-attempted after a retryable failure. */
export const MAX_QUERY_RETRIES = 2;

const HTTP_TOO_MANY_REQUESTS = 429;
const HTTP_SERVER_ERROR_FLOOR = 500;
/** First retry waits this long (before jitter); each further retry doubles it. */
const BASE_DELAY_MS = 500;
/** Random extra wait added to every backoff so a page's queries do not retry in lockstep. */
const MAX_JITTER_MS = 250;
/** Upper bound for any single wait, whether from backoff or a `Retry-After` hint. */
const MAX_DELAY_MS = 5000;

/**
 * True for failures a later attempt can plausibly fix: throttling (429),
 * server errors (5xx), and a network drop (`fetch` rejects with a
 * `TypeError`). Every other 4xx, and a response that failed schema validation,
 * will fail the same way again, so retrying only delays the error state.
 *
 * @param error - The value a query rejected with.
 * @returns Whether a retry is worth attempting.
 */
export const isRetryableQueryError = (error: unknown): boolean => {
  if (error instanceof HttpError) {
    return error.status === HTTP_TOO_MANY_REQUESTS || error.status >= HTTP_SERVER_ERROR_FLOOR;
  }
  return error instanceof TypeError;
};

/**
 * TanStack Query `retry` predicate: retry a retryable failure up to
 * {@link MAX_QUERY_RETRIES} times. TanStack passes the number of failures so
 * far, starting at 0 for the first.
 *
 * @param failureCount - Failures before this decision (0 on the first).
 * @param error - The value the query rejected with.
 * @returns Whether TanStack should schedule another attempt.
 */
export const shouldRetryQuery = (failureCount: number, error: unknown): boolean =>
  failureCount < MAX_QUERY_RETRIES && isRetryableQueryError(error);

/**
 * TanStack Query `retryDelay`: honour the server's `Retry-After` when the
 * error carries one, otherwise exponential backoff from {@link BASE_DELAY_MS}
 * with up to {@link MAX_JITTER_MS} of jitter — both capped at
 * {@link MAX_DELAY_MS}. The old fixed one-second retry re-fired a whole page's
 * throttled requests together, which simply tripped the limiter again.
 *
 * @param attempt - Failures before this retry (0 on the first).
 * @param error - The value the query rejected with.
 * @returns Milliseconds to wait before the next attempt.
 */
export const queryRetryDelay = (attempt: number, error: unknown): number => {
  if (error instanceof HttpError && error.retryAfterMs !== null) {
    return Math.min(error.retryAfterMs, MAX_DELAY_MS);
  }
  const backoff = BASE_DELAY_MS * 2 ** attempt + Math.random() * MAX_JITTER_MS;
  return Math.min(backoff, MAX_DELAY_MS);
};
