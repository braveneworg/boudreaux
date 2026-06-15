/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { z } from 'zod';

import { queryKeys } from '@/lib/query-keys';

import { fetchAndParse } from './fetch-and-parse';

import type { QueryOptionsOverride } from './query-options';

interface ReleaseListItem {
  id: string;
  title: string;
  releasedOn: string;
  artistReleases?: {
    artist: {
      id: string;
      firstName: string | null;
      surname: string;
      displayName: string | null;
    };
  }[];
}

const releaseListItemSchema = z.object({
  id: z.string(),
  title: z.string(),
  releasedOn: z.string(),
  artistReleases: z
    .array(
      z.object({
        artist: z.object({
          id: z.string(),
          firstName: z.string().nullable(),
          surname: z.string(),
          displayName: z.string().nullable(),
        }),
      })
    )
    .optional(),
}) satisfies z.ZodType<ReleaseListItem>;

// The hook consumes only `rows`; the route's pagination cursor is ignored here.
const releaseListResponseSchema = z.object({
  rows: z.array(releaseListItemSchema),
});

interface ReleaseListParams {
  search?: string;
  artistIds?: string[];
  take?: number;
}

/**
 * Fetches a filtered list of releases from the `/api/releases` route handler.
 *
 * Forwards the TanStack Query {@link AbortSignal} to `fetch` so the request is
 * cancelled automatically on unmount, invalidation, or a superseding refetch.
 *
 * @param params - The search, artist, and pagination filters for the request.
 * @param signal - The TanStack Query abort signal forwarded to `fetch`.
 * @returns The parsed JSON response's `releases` array.
 * @throws If the response status is not OK.
 */
const fetchReleaseList = async (
  params: ReleaseListParams,
  signal?: AbortSignal
): Promise<ReleaseListItem[]> => {
  const searchParams = new URLSearchParams();
  if (params.search) searchParams.set('search', params.search);
  if (params.take !== undefined) searchParams.set('take', String(params.take));
  if (params.artistIds) {
    for (const id of params.artistIds) {
      searchParams.append('artistIds', id);
    }
  }

  const queryString = searchParams.toString();
  const url = `/api/releases${queryString ? `?${queryString}` : ''}`;

  const { rows } = await fetchAndParse(url, releaseListResponseSchema, {
    signal,
    errorMessage: 'Failed to fetch releases',
  });
  return rows;
};

/**
 * React Query hook for fetching a filtered list of releases.
 *
 * Wraps {@link fetchReleaseList} with a stable query key and exposes the
 * request state. Cancellation is handled automatically via the forwarded
 * `AbortSignal`.
 *
 * @param params - The search, artist, and pagination filters for the request.
 * @param options - Caller overrides spread into the `useQuery` call (e.g.
 * `enabled`); they take precedence over the defaults below.
 * @returns The query state: `isPending`, `error` (defaulted when unknown),
 * `data`, and `refetch`.
 */
export const useReleaseListQuery = (
  params: ReleaseListParams,
  options: QueryOptionsOverride<ReleaseListItem[]> = {}
) => {
  const {
    isPending,
    error = Error('Unknown error'),
    data,
    refetch,
  } = useQuery({
    queryKey: queryKeys.releases.filteredList(params),
    queryFn: ({ signal }) => fetchReleaseList(params, signal),
    placeholderData: keepPreviousData,
    ...options,
  });

  return { isPending, error, data, refetch };
};
