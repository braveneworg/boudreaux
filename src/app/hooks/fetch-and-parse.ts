/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import type { ZodType } from 'zod';

/**
 * Options controlling a {@link fetchAndParse} request.
 */
interface FetchAndParseOptions {
  /** TanStack Query abort signal, forwarded to `fetch` for automatic cancellation. */
  signal?: AbortSignal;
  /** Cache mode forwarded to `fetch` (e.g. `'no-store'` for never-cached endpoints). */
  cache?: globalThis.RequestCache;
  /** Message thrown when the response status is not OK. */
  errorMessage?: string;
}

/**
 * Fetches a JSON API route and validates the body against a Zod schema before
 * returning it, so a malformed payload fails loudly at the network boundary
 * instead of surfacing as an undefined-shaped object deep inside a component.
 *
 * Forwards the optional `AbortSignal` to `fetch` so the request is cancelled
 * automatically on unmount, invalidation, or a superseding refetch.
 *
 * @typeParam T - The validated response type produced by `schema`.
 * @param url - The API route URL to request.
 * @param schema - Zod schema describing the expected response body.
 * @param options - Optional `signal`, `cache` mode, and `errorMessage`.
 * @returns The parsed, schema-validated response body.
 * @throws If the response status is not OK, or the body fails schema validation.
 */
export async function fetchAndParse<T>(
  url: string,
  schema: ZodType<T>,
  { signal, cache, errorMessage = 'Request failed' }: FetchAndParseOptions = {}
): Promise<T> {
  const response = await fetch(url, { signal, ...(cache ? { cache } : {}) });
  if (!response.ok) {
    throw new Error(errorMessage);
  }
  const body: unknown = await response.json();
  return schema.parse(body);
}
