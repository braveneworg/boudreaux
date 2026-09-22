/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { z, type ZodType } from 'zod';

/**
 * Options controlling a {@link fetchAndParse} request.
 *
 * @typeParam TFallback - Union of the values mapped by `fallbackByStatus`.
 *   Defaults to `never` when the option is omitted, so the return type of a
 *   call that does not opt in stays exactly `T`.
 */
interface FetchAndParseOptions<TFallback> {
  /** TanStack Query abort signal, forwarded to `fetch` for automatic cancellation. */
  signal?: AbortSignal;
  /** Cache mode forwarded to `fetch` (e.g. `'no-store'` for never-cached endpoints). */
  cache?: globalThis.RequestCache;
  /** Message thrown when the response status is not OK and is not mapped below. */
  errorMessage?: string;
  /**
   * HTTP statuses to resolve with a value instead of throwing — the common case
   * being `{ 404: null }` for a detail endpoint whose absence is a legitimate
   * result rather than a failure, or `{ 401: null }` for a signed-out read.
   *
   * The status is matched by key presence, so mapping one explicitly to
   * `undefined` resolves rather than throws.
   */
  fallbackByStatus?: Partial<Record<number, TFallback>>;
}

/**
 * Fetches a JSON API route and validates the body against a Zod schema before
 * returning it, so a malformed payload fails loudly at the network boundary
 * instead of surfacing as an undefined-shaped object deep inside a component.
 *
 * Forwards the optional `AbortSignal` to `fetch` so the request is cancelled
 * automatically on unmount, invalidation, or a superseding refetch.
 *
 * A non-OK status throws an {@link HttpError} carrying `errorMessage`, the
 * status, and any `Retry-After` hint, unless `fallbackByStatus` maps it, in
 * which case the mapped value resolves and the body is never read.
 *
 * @typeParam T - The validated response type produced by `schema`.
 * @typeParam TFallback - Union of the `fallbackByStatus` values, inferred from
 *   the option and `never` when it is omitted.
 * @param url - The API route URL to request.
 * @param schema - Zod schema describing the expected response body.
 * @param options - Optional `signal`, `cache` mode, `errorMessage`, and
 *   `fallbackByStatus`.
 * @returns The parsed, schema-validated response body, or the value mapped for
 *   the response status.
 * @throws {HttpError} If the status is not OK and unmapped.
 * @throws {ResponseValidationError} If the body fails validation.
 */
export const fetchAndParse = async <T, TFallback = never>(
  url: string,
  schema: ZodType<T>,
  {
    signal,
    cache,
    errorMessage = 'Request failed',
    fallbackByStatus,
  }: FetchAndParseOptions<TFallback> = {}
): Promise<T | TFallback> => {
  const response = await fetch(url, { signal, ...(cache ? { cache } : {}) });
  if (!response.ok) {
    if (fallbackByStatus && Object.hasOwn(fallbackByStatus, response.status)) {
      return fallbackByStatus[response.status] as TFallback;
    }
    throw new HttpError(errorMessage, response.status, parseRetryAfter(readRetryAfter(response)));
  }
  const body: unknown = await response.json();
  return parseResponse(url, schema, body);
};

const MS_PER_SECOND = 1000;

/** Reads the `Retry-After` header, tolerating fetch stubs that expose no `headers` at all. */
const readRetryAfter = ({ headers }: { headers?: Headers }): string | null =>
  headers?.get('retry-after') ?? null;

/**
 * Converts a `Retry-After` header into a wait in milliseconds. The header is
 * either delta-seconds or an HTTP-date (RFC 9110 §10.2.3); a date already in
 * the past means "now", and anything unparseable is treated as absent.
 *
 * @param header - The raw header value, or `null` when the response had none.
 * @returns Milliseconds to wait, or `null` when there is no usable hint.
 */
export const parseRetryAfter = (header: string | null): number | null => {
  if (header === null) return null;
  const value = header.trim();
  if (/^\d+$/.test(value)) return Number(value) * MS_PER_SECOND;
  const at = Date.parse(value);
  return Number.isNaN(at) ? null : Math.max(0, at - Date.now());
};

/**
 * Error thrown by {@link fetchAndParse} for a non-OK response that no
 * `fallbackByStatus` entry maps. The `message` stays the caller's
 * `errorMessage` so existing matchers keep working; the status and the
 * server's `Retry-After` hint let the global TanStack Query retry policy
 * back off on throttling (429) and server errors without retrying a 4xx the
 * user cannot fix by waiting.
 */
export class HttpError extends Error {
  /** The HTTP status of the failed response. */
  readonly status: number;
  /** The server's `Retry-After` hint in milliseconds, or `null` when absent. */
  readonly retryAfterMs: number | null;

  /**
   * @param message - The caller-facing failure message.
   * @param status - The HTTP status of the failed response.
   * @param retryAfterMs - The parsed `Retry-After` hint, or `null`.
   */
  constructor(message: string, status: number, retryAfterMs: number | null = null) {
    super(message);
    this.name = 'HttpError';
    this.status = status;
    this.retryAfterMs = retryAfterMs;
  }
}

/**
 * Error thrown when a response body fails Zod validation. Distinguished from
 * generic fetch/network/HTTP errors so a global TanStack Query handler can
 * report only genuine API contract drift, not transient failures.
 */
export class ResponseValidationError extends Error {
  /** The API route whose response failed schema validation. */
  readonly url: string;

  /**
   * @param url - The API route whose response failed validation.
   * @param issues - Prettified Zod issues (field paths + expected types only).
   */
  constructor(url: string, issues: string) {
    super(`Invalid response from ${url}: ${issues}`);
    this.name = 'ResponseValidationError';
    this.url = url;
  }
}

/**
 * Validates an already-fetched JSON body against a Zod schema, throwing a
 * {@link ResponseValidationError} (endpoint URL + prettified Zod issues) on
 * failure so the cause is legible in logs and surfaces via TanStack Query's
 * `error`.
 *
 * Use this directly when a hook needs response handling {@link fetchAndParse}
 * does not cover — unwrapping an envelope before validating, composing a
 * timeout into the signal, or deriving the thrown message from the error body.
 * Mapping a status to a value is covered: pass `fallbackByStatus` instead.
 *
 * @typeParam T - The validated response type produced by `schema`.
 * @param url - The API route the body came from (included in the error message).
 * @param schema - Zod schema describing the expected response body.
 * @param body - The parsed JSON body to validate.
 * @returns The schema-validated body.
 * @throws {ResponseValidationError} If the body fails schema validation.
 */
export const parseResponse = <T>(url: string, schema: ZodType<T>, body: unknown): T => {
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    throw new ResponseValidationError(url, z.prettifyError(parsed.error));
  }
  return parsed.data;
};
