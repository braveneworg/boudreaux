/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { keepPreviousData, useInfiniteQuery } from '@tanstack/react-query';

import { queryKeys } from '@/lib/query-keys';
import type { Artist } from '@/lib/types/media-models';
import type { PaginatedResponse } from '@/lib/types/pagination';

import type { InfiniteQueryOptionsOverride } from './query-options';

/** Filters that drive the admin artists infinite query. */
export interface ArtistsQueryParams {
  search: string;
  published: boolean | null;
  deleted: boolean;
}

/** One skip/offset page of artists returned by `/api/artists`. */
export type ArtistsPaginatedResponse = PaginatedResponse<Artist>;

/** Page size requested per fetch. */
export const ARTISTS_PAGE_SIZE = 24;

/**
 * Fetches one page of artists from the `/api/artists` route handler.
 *
 * Forwards the TanStack Query {@link AbortSignal} to `fetch` so the request is
 * cancelled automatically on unmount, invalidation, or a superseding refetch.
 *
 * @param params - Server-side search/published/deleted filters.
 * @param skip - Offset of the page to fetch.
 * @param signal - The query's abort signal.
 * @returns The page of artists plus the `nextSkip` cursor.
 * @throws If the response status is not OK.
 */
const fetchArtistsPage = async (
  params: ArtistsQueryParams,
  skip: number,
  signal?: AbortSignal
): Promise<ArtistsPaginatedResponse> => {
  const searchParams = new URLSearchParams({
    skip: String(skip),
    take: String(ARTISTS_PAGE_SIZE),
  });
  if (params.search) searchParams.set('search', params.search);
  if (params.published !== null) searchParams.set('published', String(params.published));
  if (params.deleted) searchParams.set('deleted', 'true');

  const response = await fetch(`/api/artists?${searchParams.toString()}`, { signal });
  if (!response.ok) {
    throw Error('Failed to fetch artists');
  }
  return response.json() as Promise<ArtistsPaginatedResponse>;
};

/**
 * React Query infinite hook for the admin artists listing.
 *
 * Pages through `/api/artists` via skip/offset, accumulating results for
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
export const useArtistsQuery = (
  params: ArtistsQueryParams,
  options: InfiniteQueryOptionsOverride<ArtistsPaginatedResponse> = {}
) =>
  useInfiniteQuery({
    queryKey: queryKeys.artists.adminInfinite(params),
    queryFn: ({ pageParam, signal }) => fetchArtistsPage(params, pageParam, signal),
    initialPageParam: 0,
    getNextPageParam: (lastPage) => lastPage.nextSkip,
    placeholderData: keepPreviousData,
    ...options,
  });
