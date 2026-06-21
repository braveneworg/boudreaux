/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { useQuery } from '@tanstack/react-query';
import { type z } from 'zod';

import { queryKeys } from '@/lib/query-keys';
import { releaseSchema } from '@/lib/validation/media-models-schema';

import { parseResponse } from './fetch-and-parse';

import type { QueryOptionsOverride } from './query-options';

/** The full admin `Release` shape returned by `GET /api/releases/[id]`. */
export type ReleaseDetail = z.infer<typeof releaseSchema>;

/**
 * Fetches a single release with its full admin relations from the
 * `/api/releases/[id]` route handler (no `withTracks`, so the backing
 * `getReleaseById` returns every scalar plus images, artist joins, digital
 * formats, and url joins the edit form needs — unlike the public
 * {@link useReleaseQuery}, which requests the tracks-and-stream payload).
 *
 * The route returns the release object directly (not wrapped), so the body is
 * validated as-is. Forwards the TanStack Query {@link AbortSignal} to `fetch`
 * so the request is cancelled automatically on unmount, invalidation, or a
 * superseding refetch.
 *
 * @param releaseId - The release identifier to fetch.
 * @param signal - The `AbortSignal` forwarded from TanStack Query.
 * @returns The parsed release detail, or `null` when not found (404).
 * @throws If the response status is not OK (other than 404).
 */
const fetchReleaseDetail = async (
  releaseId: string,
  signal?: AbortSignal
): Promise<ReleaseDetail | null> => {
  const url = `/api/releases/${encodeURIComponent(releaseId)}`;
  const response = await fetch(url, { signal });
  if (!response.ok) {
    if (response.status === 404) {
      return null;
    }
    throw Error('Failed to fetch release');
  }
  return parseResponse(url, releaseSchema, await response.json());
};

/**
 * React Query hook for fetching a single release with its full admin relations.
 *
 * Wraps {@link fetchReleaseDetail} with a stable query key and exposes the
 * request state. Cancellation is handled automatically via the forwarded
 * `AbortSignal`.
 *
 * @param releaseId - The release identifier to fetch.
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
    queryFn: ({ signal }) => fetchReleaseDetail(releaseId, signal),
    ...options,
    enabled: (options.enabled ?? true) && !!releaseId,
  });

  return { isPending, isError, error, data, refetch };
};
