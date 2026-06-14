/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { keepPreviousData, useInfiniteQuery } from '@tanstack/react-query';

import { queryKeys } from '@/lib/query-keys';
import type { FeaturedArtist } from '@/lib/types/media-models';
import type { PaginatedResponse } from '@/lib/types/pagination';

import type { InfiniteQueryOptionsOverride } from './query-options';

/** Filters that drive the admin featured-artists infinite query. */
export interface FeaturedArtistsQueryParams {
  search: string;
  published: boolean | null;
  deleted: boolean;
}

/** One skip/offset page of featured artists returned by `/api/featured-artists`. */
export type FeaturedArtistsPaginatedResponse = PaginatedResponse<FeaturedArtist>;

/** Page size requested per fetch. */
export const FEATURED_ARTISTS_PAGE_SIZE = 24;

/**
 * Fetches one page of featured artists from the `/api/featured-artists` route
 * handler (admin listing — no `active` param).
 *
 * Forwards the TanStack Query {@link AbortSignal} to `fetch` so the request is
 * cancelled automatically on unmount, invalidation, or a superseding refetch.
 *
 * @param params - Server-side search/published/deleted filters.
 * @param skip - Offset of the page to fetch.
 * @param signal - The query's abort signal.
 * @returns The page of featured artists plus the `nextSkip` cursor.
 * @throws If the response status is not OK.
 */
const fetchFeaturedArtistsPage = async (
  params: FeaturedArtistsQueryParams,
  skip: number,
  signal?: AbortSignal
): Promise<FeaturedArtistsPaginatedResponse> => {
  const searchParams = new URLSearchParams({
    skip: String(skip),
    take: String(FEATURED_ARTISTS_PAGE_SIZE),
  });
  if (params.search) searchParams.set('search', params.search);
  if (params.published !== null) searchParams.set('published', String(params.published));
  if (params.deleted) searchParams.set('deleted', 'true');

  const response = await fetch(`/api/featured-artists?${searchParams.toString()}`, { signal });
  if (!response.ok) {
    throw Error('Failed to fetch featured artists');
  }
  return response.json() as Promise<FeaturedArtistsPaginatedResponse>;
};

/**
 * React Query infinite hook for the admin featured-artists listing.
 *
 * Pages through `/api/featured-artists` via skip/offset, accumulating results
 * for infinite scroll. Search, published, and deleted filters are applied
 * server-side and are part of the query key, so changing any of them resets
 * pagination. Always refetches on mount so create/edit returns show fresh data.
 *
 * @param params - The server-side search/published/deleted filters.
 * @param options - Caller overrides spread into the `useInfiniteQuery` call
 * (e.g. `enabled`, `staleTime`); they take precedence over the defaults below.
 * @returns The TanStack `useInfiniteQuery` result (`data.pages`, `fetchNextPage`, etc.).
 */
export const useFeaturedArtistsQuery = (
  params: FeaturedArtistsQueryParams,
  options: InfiniteQueryOptionsOverride<FeaturedArtistsPaginatedResponse> = {}
) =>
  useInfiniteQuery({
    queryKey: queryKeys.featuredArtists.adminInfinite(params),
    queryFn: ({ pageParam, signal }) => fetchFeaturedArtistsPage(params, pageParam, signal),
    initialPageParam: 0,
    getNextPageParam: (lastPage) => lastPage.nextSkip,
    placeholderData: keepPreviousData,
    refetchOnMount: 'always', // Always refetch when admin page mounts (e.g., after create/edit)
    ...options,
  });
