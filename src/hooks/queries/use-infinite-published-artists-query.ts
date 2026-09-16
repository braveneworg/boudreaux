/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { keepPreviousData, useInfiniteQuery } from '@tanstack/react-query';

import type { InfiniteQueryOptionsOverride } from '@/hooks/query-options';
import { queryKeys } from '@/lib/query-keys';
import type { ArtistListingRow, ArtistListingSort } from '@/lib/types/domain/artist';
import type { PaginatedResponse } from '@/lib/types/pagination';
import { ARTIST_LISTING_DEFAULT_TAKE } from '@/lib/validation/artist-listing-query-schema';
import { artistListingPageSchema } from '@/lib/validation/artist-listing-schema';
import { fetchAndParse } from '@/utils/fetch-and-parse';

/** One skip/offset page of listed artists returned by `/api/artists?listing=published`. */
export type PublishedArtistsPaginatedResponse = PaginatedResponse<ArtistListingRow>;

/** Page size requested per fetch — kept in sync with the SSR prefetch and the route default. */
export const PUBLISHED_ARTISTS_PAGE_SIZE = ARTIST_LISTING_DEFAULT_TAKE;

/** Request parameters for one `/api/artists?listing=published` page fetch. */
interface FetchPublishedArtistsParams {
  /** Listing order applied server-side. */
  sort: ArtistListingSort;
  /** Server-side name/aka/genre/release-title search term (empty fetches all). */
  search: string;
  /** Offset of the page to fetch. */
  skip: number;
  /** Page size to request. */
  take: number;
  /** The query's abort signal. */
  signal?: AbortSignal;
}

/**
 * Fetches one page of listed artists from the `/api/artists?listing=published`
 * route handler.
 *
 * Forwards the TanStack Query {@link AbortSignal} to `fetch` so the request is
 * cancelled automatically on unmount, invalidation, or a superseding refetch.
 *
 * @param params - Sort/search/pagination inputs plus the abort signal.
 * @returns The page of listing rows plus the `nextSkip` cursor.
 * @throws If the response status is not OK.
 */
const fetchPublishedArtists = async ({
  sort,
  search,
  skip,
  take,
  signal,
}: FetchPublishedArtistsParams): Promise<PublishedArtistsPaginatedResponse> => {
  const params = new URLSearchParams({
    listing: 'published',
    skip: String(skip),
    take: String(take),
    sort,
  });
  if (search) params.set('search', search);

  return fetchAndParse(`/api/artists?${params.toString()}`, artistListingPageSchema, {
    signal,
    errorMessage: 'Failed to fetch artists',
  });
};

/**
 * React Query infinite hook for the public artists index.
 *
 * Pages through the published-artists endpoint via skip/offset, accumulating
 * rows for infinite scroll. `sort` and `search` are applied server-side and
 * are part of the query key, so changing either resets pagination;
 * `keepPreviousData` keeps the current rows visible during a sort or search
 * transition. The first page of the same query is what the search combobox
 * suggests from, so the grid and the dropdown never disagree.
 *
 * @param sort - Listing order (defaults to A–Z by display name).
 * @param search - Debounced search term (defaults to every listed artist).
 * @param options - Caller overrides spread into the `useInfiniteQuery` call
 * (e.g. `enabled`, `staleTime`); they take precedence over the defaults below.
 * @returns The TanStack `useInfiniteQuery` result (`data.pages`, `fetchNextPage`, etc.).
 */
export const useInfinitePublishedArtistsQuery = (
  sort: ArtistListingSort = 'alpha',
  search = '',
  options: InfiniteQueryOptionsOverride<PublishedArtistsPaginatedResponse> = {}
) =>
  useInfiniteQuery({
    queryKey: queryKeys.artists.publishedInfinite(sort, search),
    queryFn: ({ pageParam, signal }) =>
      fetchPublishedArtists({
        sort,
        search,
        skip: pageParam,
        take: PUBLISHED_ARTISTS_PAGE_SIZE,
        signal,
      }),
    initialPageParam: 0,
    getNextPageParam: (lastPage) => lastPage.nextSkip,
    placeholderData: keepPreviousData,
    ...options,
  });
