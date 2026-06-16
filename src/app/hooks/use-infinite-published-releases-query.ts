/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { keepPreviousData, useInfiniteQuery, useQuery } from '@tanstack/react-query';

import { queryKeys } from '@/lib/query-keys';
import type { PublishedReleaseListing } from '@/lib/types/media-models';
import type { PaginatedResponse } from '@/lib/types/pagination';
import { publishedReleaseListingSchema } from '@/lib/validation/media-models-schema';
import { paginatedResponseSchema } from '@/lib/validation/pagination-schema';

import { fetchAndParse } from './fetch-and-parse';

import type { InfiniteQueryOptionsOverride, QueryOptionsOverride } from './query-options';

/** One skip/offset page of published releases returned by `/api/releases?listing=published`. */
export type PublishedReleasesPaginatedResponse = PaginatedResponse<PublishedReleaseListing>;

/** Page size requested per fetch — kept in sync with the SSR prefetch and service. */
export const PUBLISHED_RELEASES_PAGE_SIZE = 24;

/** Strict schema for one `/api/releases?listing=published` page. */
const publishedReleasesPaginatedResponseSchema = paginatedResponseSchema(
  publishedReleaseListingSchema
);

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
const fetchPublishedReleases = async (
  search: string,
  skip: number,
  take: number,
  signal?: AbortSignal
): Promise<PublishedReleasesPaginatedResponse> => {
  const params = new URLSearchParams({
    listing: 'published',
    skip: String(skip),
    take: String(take),
  });
  if (search) params.set('search', search);

  return fetchAndParse(
    `/api/releases?${params.toString()}`,
    publishedReleasesPaginatedResponseSchema,
    {
      signal,
      errorMessage: 'Failed to fetch releases',
    }
  );
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
 * @param options - Caller overrides spread into the `useInfiniteQuery` call
 * (e.g. `enabled`, `staleTime`); they take precedence over the defaults below.
 * @returns The TanStack `useInfiniteQuery` result (`data.pages`, `fetchNextPage`, etc.).
 */
export const usePublishedReleasesQuery = (
  search = '',
  options: InfiniteQueryOptionsOverride<PublishedReleasesPaginatedResponse> = {}
) =>
  useInfiniteQuery({
    queryKey: queryKeys.releases.publishedInfinite(search),
    queryFn: ({ pageParam, signal }) =>
      fetchPublishedReleases(search, pageParam, PUBLISHED_RELEASES_PAGE_SIZE, signal),
    initialPageParam: 0,
    getNextPageParam: (lastPage) => lastPage.nextSkip,
    placeholderData: keepPreviousData,
    ...options,
  });

/**
 * Lightweight quick-search hook for the releases combobox.
 *
 * Hits the same published endpoint with the typed term and returns the first
 * page of matches (capped at {@link SEARCH_RESULT_LIMIT}). Disabled until the
 * user types, so opening the combobox costs nothing.
 *
 * @param search - Debounced search term.
 * @param options - Caller overrides spread into the `useQuery` call (e.g.
 * `enabled`); the non-empty-search gate is always applied on top.
 * @returns The TanStack `useQuery` result whose `data` is the matching releases.
 */
export const usePublishedReleaseSearchQuery = (
  search: string,
  options: QueryOptionsOverride<PublishedReleasesPaginatedResponse, PublishedReleaseListing[]> = {}
) =>
  useQuery({
    queryKey: queryKeys.releases.publishedInfinite(`combobox:${search}`),
    queryFn: ({ signal }) => fetchPublishedReleases(search, 0, SEARCH_RESULT_LIMIT, signal),
    select: (page) => page.rows,
    placeholderData: keepPreviousData,
    ...options,
    enabled: (options.enabled ?? true) && search.trim().length > 0,
  });
