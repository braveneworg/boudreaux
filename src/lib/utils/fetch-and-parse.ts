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
 * A non-OK status throws `errorMessage` unless `fallbackByStatus` maps it, in
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
 * @throws If the status is not OK and unmapped, or the body fails validation.
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
    throw new Error(errorMessage);
  }
  const body: unknown = await response.json();
  return parseResponse(url, schema, body);
};

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
