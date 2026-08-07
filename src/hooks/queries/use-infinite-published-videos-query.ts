/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { keepPreviousData, useInfiniteQuery } from '@tanstack/react-query';

import type { InfiniteQueryOptionsOverride } from '@/hooks/query-options';
import { queryKeys } from '@/lib/query-keys';
import type { PaginatedResponse } from '@/lib/types/pagination';
import { videoPageSchema, type VideoRow } from '@/lib/validation/video-schema';
import { fetchAndParse } from '@/utils/fetch-and-parse';

/** One skip/offset page of published videos returned by `/api/videos?listing=published`. */
export type PublishedVideosPaginatedResponse = PaginatedResponse<VideoRow>;

/** Page size requested per fetch — kept in sync with the SSR prefetch and service. */
export const PUBLISHED_VIDEOS_PAGE_SIZE = 5;

/** Request parameters for one `/api/videos?listing=published` page fetch. */
interface FetchPublishedVideosParams {
  /** Release-date sort direction applied server-side. */
  sort: 'asc' | 'desc';
  /** Server-side title/artist search term (empty fetches all). */
  search: string;
  /** Offset of the page to fetch. */
  skip: number;
  /** Page size to request. */
  take: number;
  /** The query's abort signal. */
  signal?: AbortSignal;
}

/**
 * Fetches one page of published, non-archived videos from the
 * `/api/videos?listing=published` route handler.
 *
 * Forwards the TanStack Query {@link AbortSignal} to `fetch` so the request is
 * cancelled automatically on unmount, invalidation, or a superseding refetch.
 *
 * @param params - Sort/search/pagination inputs plus the abort signal.
 * @returns The page of videos plus the `nextSkip` cursor.
 * @throws If the response status is not OK.
 */
const fetchPublishedVideos = async ({
  sort,
  search,
  skip,
  take,
  signal,
}: FetchPublishedVideosParams): Promise<PublishedVideosPaginatedResponse> => {
  const params = new URLSearchParams({
    listing: 'published',
    skip: String(skip),
    take: String(take),
    sort,
  });
  if (search) params.set('search', search);

  return fetchAndParse(`/api/videos?${params.toString()}`, videoPageSchema, {
    signal,
    errorMessage: 'Failed to fetch videos',
  });
};

/**
 * React Query infinite hook for the signed-in public videos listing.
 *
 * Pages through the published-videos endpoint via skip/offset, accumulating
 * results for infinite scroll. `sort` and `search` are applied server-side and
 * are part of the query key, so changing either resets pagination;
 * `keepPreviousData` keeps the current results visible during a sort or search
 * transition.
 *
 * @param sort - Release-date sort direction (defaults to newest first).
 * @param search - Debounced title/artist search term (defaults to all videos).
 * @param options - Caller overrides spread into the `useInfiniteQuery` call
 * (e.g. `enabled`, `staleTime`); they take precedence over the defaults below.
 * @returns The TanStack `useInfiniteQuery` result (`data.pages`, `fetchNextPage`, etc.).
 */
export const useInfinitePublishedVideosQuery = (
  sort: 'asc' | 'desc' = 'desc',
  search = '',
  options: InfiniteQueryOptionsOverride<PublishedVideosPaginatedResponse> = {}
) =>
  useInfiniteQuery({
    queryKey: queryKeys.videos.publishedInfinite(sort, search),
    queryFn: ({ pageParam, signal }) =>
      fetchPublishedVideos({
        sort,
        search,
        skip: pageParam,
        take: PUBLISHED_VIDEOS_PAGE_SIZE,
        signal,
      }),
    initialPageParam: 0,
    getNextPageParam: (lastPage) => lastPage.nextSkip,
    placeholderData: keepPreviousData,
    ...options,
  });
