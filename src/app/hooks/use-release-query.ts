/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { useQuery } from '@tanstack/react-query';
import { type z, type ZodType } from 'zod';

import { queryKeys } from '@/lib/query-keys';
import { publishedReleaseDetailSchema, releaseSchema } from '@/lib/validation/media-models-schema';
import { parseResponse } from '@/utils/fetch-and-parse';

import type { QueryOptionsOverride } from './query-options';

/** The public, tracks-and-stream release payload (`?withTracks=true`). */
export type PublishedReleaseDetail = z.infer<typeof publishedReleaseDetailSchema>;

/** The full admin `Release` shape returned by `GET /api/releases/[id]` (no `withTracks`). */
export type ReleaseDetail = z.infer<typeof releaseSchema>;

/**
 * Fetches a single release by id from the `/api/releases/[id]` route handler,
 * validating the body against `schema`. With `withTracks`, requests the public
 * tracks-and-stream payload; without it, the route returns the full admin
 * release (every scalar plus images, artist joins, digital formats, url joins).
 *
 * Maps a 404 to `null`; forwards the TanStack Query {@link AbortSignal} to
 * `fetch` so the request is cancelled automatically on unmount, invalidation,
 * or a superseding refetch.
 *
 * @typeParam T - The validated release shape produced by `schema`.
 * @param releaseId - The release identifier to fetch.
 * @param schema - Zod schema describing the expected response body.
 * @param withTracks - When `true`, appends `?withTracks=true` to the request.
 * @param signal - The `AbortSignal` forwarded from TanStack Query.
 * @returns The parsed release, or `null` when not found (404).
 * @throws If the response status is not OK (other than 404).
 */
const fetchReleaseById = async <T>(
  releaseId: string,
  schema: ZodType<T>,
  withTracks: boolean,
  signal?: AbortSignal
): Promise<T | null> => {
  const url = `/api/releases/${encodeURIComponent(releaseId)}${withTracks ? '?withTracks=true' : ''}`;
  const response = await fetch(url, { signal });
  if (!response.ok) {
    if (response.status === 404) {
      return null;
    }
    throw Error('Failed to fetch release');
  }
  return parseResponse(url, schema, await response.json());
};

/**
 * React Query hook for fetching a single release for the public release page —
 * the `?withTracks=true` payload validated against `publishedReleaseDetailSchema`.
 *
 * Shares the fetch/validate/404→null logic with {@link useReleaseDetailQuery}
 * via {@link fetchReleaseById}, differing only by schema, query key, and the
 * `withTracks` flag. Cancellation is handled automatically via the forwarded
 * `AbortSignal`.
 *
 * @param releaseId - The ID of the release to fetch; the query is disabled
 * when empty.
 * @param options - Caller overrides spread into the `useQuery` call (e.g.
 * `enabled`); the non-empty-releaseId gate is always applied on top.
 * @returns The query state: `isPending`, `isError`, `error` (defaulted when
 * unknown), `data`, and `refetch`.
 */
export const useReleaseQuery = (
  releaseId: string,
  options: QueryOptionsOverride<PublishedReleaseDetail | null> = {}
) => {
  const {
    isPending,
    isError,
    error = Error('Unknown error'),
    data,
    refetch,
  } = useQuery({
    queryKey: queryKeys.releases.detail(releaseId),
    queryFn: ({ signal }) =>
      fetchReleaseById(releaseId, publishedReleaseDetailSchema, true, signal),
    ...options,
    enabled: (options.enabled ?? true) && !!releaseId,
  });

  return { isPending, isError, error, data, refetch };
};

/**
 * React Query hook for fetching a single release with its full admin relations
 * for the edit form — no `withTracks`, so the backing `getReleaseById` returns
 * every scalar plus images, artist joins, digital formats, and url joins,
 * validated against `releaseSchema`. Distinct from the public
 * {@link useReleaseQuery} in payload, schema, and cache key.
 *
 * Shares the fetch/validate/404→null logic with {@link useReleaseQuery} via
 * {@link fetchReleaseById}. Cancellation is handled automatically via the
 * forwarded `AbortSignal`.
 *
 * @param releaseId - The release identifier to fetch; the query is disabled
 * when empty.
 * @param options - Caller overrides spread into the `useQuery` call (e.g.
 * `enabled`); the non-empty-releaseId gate is always applied on top.
 * @returns The query state: `isPending`, `isError`, `error` (defaulted when
 * unknown), `data`, and `refetch`.
 */
export const useReleaseDetailQuery = (
  releaseId: string,
  options: QueryOptionsOverride<ReleaseDetail | null> = {}
) => {
  const {
    isPending,
    isError,
    error = Error('Unknown error'),
    data,
    refetch,
  } = useQuery({
    queryKey: queryKeys.releases.adminDetail(releaseId),
    queryFn: ({ signal }) => fetchReleaseById(releaseId, releaseSchema, false, signal),
    ...options,
    enabled: (options.enabled ?? true) && !!releaseId,
  });

  return { isPending, isError, error, data, refetch };
};
