/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { keepPreviousData, useInfiniteQuery, useQuery } from '@tanstack/react-query';

import { queryKeys } from '@/lib/query-keys';
import type { PublishedReleaseListing } from '@/lib/types/media-models';
import type { PaginatedResponse } from '@/lib/types/pagination';

/** One skip/offset page of published releases returned by `/api/releases?listing=published`. */
export type PublishedReleasesPage = PaginatedResponse<PublishedReleaseListing>;

/** Page size requested per fetch — kept in sync with the SSR prefetch and service. */
export const PUBLISHED_RELEASES_PAGE_SIZE = 24;

/** Max combobox quick-search results. */
const SEARCH_RESULT_LIMIT = 20;

/**
 * Fetches one page of published releases from the
 * `/api/releases?listing=published` route handler.
 *
 * Forwards the TanStack Query {@link AbortSignal} to `fetch` so the request is
 * cancelled automatically on unmount, invalidation, or a superseding refetch.
 *
 * @param search - Server-side search term (empty string fetches all releases).
 * @param skip - Offset of the page to fetch.
 * @param take - Page size to request.
 * @param signal - The query's abort signal.
 * @returns The page of releases plus the `nextSkip` cursor.
 * @throws If the response status is not OK.
 */
const fetchPublishedReleasesPage = async (
  search: string,
  skip: number,
  take: number,
  signal?: AbortSignal
): Promise<PublishedReleasesPage> => {
  const params = new URLSearchParams({
    listing: 'published',
    skip: String(skip),
    take: String(take),
  });
  if (search) params.set('search', search);

  const response = await fetch(`/api/releases?${params.toString()}`, { signal });
  if (!response.ok) {
    throw Error('Failed to fetch releases');
  }
  return response.json() as Promise<PublishedReleasesPage>;
};

/**
 * React Query infinite hook for the public releases listing.
 *
 * Pages through the published-releases endpoint via skip/offset, accumulating
 * results for infinite scroll. `search` is applied server-side and is part of
 * the query key, so changing it resets pagination; `keepPreviousData` keeps the
 * current results visible during a search transition.
 *
 * @param search - Debounced, server-side search term (defaults to all releases).
 * @returns The TanStack `useInfiniteQuery` result (`data.pages`, `fetchNextPage`, etc.).
 */
export const usePublishedReleasesQuery = (search = '') =>
  useInfiniteQuery({
    queryKey: queryKeys.releases.publishedInfinite(search),
    queryFn: ({ pageParam, signal }) =>
      fetchPublishedReleasesPage(search, pageParam, PUBLISHED_RELEASES_PAGE_SIZE, signal),
    initialPageParam: 0,
    getNextPageParam: (lastPage) => lastPage.nextSkip,
    placeholderData: keepPreviousData,
  });

/**
 * Lightweight quick-search hook for the releases combobox.
 *
 * Hits the same published endpoint with the typed term and returns the first
 * page of matches (capped at {@link SEARCH_RESULT_LIMIT}). Disabled until the
 * user types, so opening the combobox costs nothing.
 *
 * @param search - Debounced search term.
 * @returns The TanStack `useQuery` result whose `data` is the matching releases.
 */
export const usePublishedReleaseSearchQuery = (search: string) =>
  useQuery({
    queryKey: queryKeys.releases.publishedInfinite(`combobox:${search}`),
    queryFn: ({ signal }) => fetchPublishedReleasesPage(search, 0, SEARCH_RESULT_LIMIT, signal),
    select: (page) => page.rows,
    enabled: search.trim().length > 0,
    placeholderData: keepPreviousData,
  });
