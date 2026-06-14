/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { keepPreviousData, useInfiniteQuery } from '@tanstack/react-query';

import { queryKeys } from '@/lib/query-keys';
import type { Release } from '@/lib/types/media-models';
import type { PaginatedResponse } from '@/lib/types/pagination';
import { releaseSchema } from '@/lib/validation/media-models-schema';
import { paginatedResponseSchema } from '@/lib/validation/pagination-schema';

import { fetchAndParse } from './fetch-and-parse';

import type { InfiniteQueryOptionsOverride } from './query-options';

/** Filters that drive the admin releases infinite query. */
export interface ReleasesQueryParams {
  search: string;
  published: boolean | null;
  deleted: boolean;
}

/** One skip/offset page of releases returned by `/api/releases`. */
export type ReleasesPaginatedResponse = PaginatedResponse<Release>;

/** Page size requested per fetch. */
export const RELEASES_PAGE_SIZE = 24;

/** Strict schema for one `/api/releases` page. */
const releasesPageSchema = paginatedResponseSchema(releaseSchema);

/**
 * Fetches one page of releases from the `/api/releases` route handler (admin
 * listing — no `listing` param).
 *
 * Forwards the TanStack Query {@link AbortSignal} to `fetch` so the request is
 * cancelled automatically on unmount, invalidation, or a superseding refetch.
 *
 * @param params - Server-side search/published/deleted filters.
 * @param skip - Offset of the page to fetch.
 * @param signal - The query's abort signal.
 * @returns The page of releases plus the `nextSkip` cursor.
 * @throws If the response status is not OK.
 */
const fetchReleasesPage = async (
  params: ReleasesQueryParams,
  skip: number,
  signal?: AbortSignal
): Promise<ReleasesPaginatedResponse> => {
  const searchParams = new URLSearchParams({
    skip: String(skip),
    take: String(RELEASES_PAGE_SIZE),
  });
  if (params.search) searchParams.set('search', params.search);
  if (params.published !== null) searchParams.set('published', String(params.published));
  if (params.deleted) searchParams.set('deleted', 'true');

  return fetchAndParse(`/api/releases?${searchParams.toString()}`, releasesPageSchema, {
    signal,
    errorMessage: 'Failed to fetch releases',
  });
};

/**
 * React Query infinite hook for the admin releases listing.
 *
 * Pages through `/api/releases` via skip/offset, accumulating results for
 * infinite scroll. Search, published, and deleted filters are applied
 * server-side and are part of the query key, so changing any of them resets
 * pagination. `keepPreviousData` keeps the current results visible during a
 * filter transition. Cancellation is automatic via the forwarded `AbortSignal`.
 *
 * @param params - The server-side search/published/deleted filters.
 * @param options - Caller overrides spread into the `useInfiniteQuery` call
 * (e.g. `enabled`, `staleTime`); they take precedence over the defaults below.
 * @returns The TanStack `useInfiniteQuery` result (`data.pages`, `fetchNextPage`, etc.).
 */
export const useReleasesQuery = (
  params: ReleasesQueryParams,
  options: InfiniteQueryOptionsOverride<ReleasesPaginatedResponse> = {}
) =>
  useInfiniteQuery({
    queryKey: queryKeys.releases.adminInfinite(params),
    queryFn: ({ pageParam, signal }) => fetchReleasesPage(params, pageParam, signal),
    initialPageParam: 0,
    getNextPageParam: (lastPage) => lastPage.nextSkip,
    placeholderData: keepPreviousData,
    ...options,
  });
