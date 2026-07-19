/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { keepPreviousData, useInfiniteQuery } from '@tanstack/react-query';

import { queryKeys } from '@/lib/query-keys';
import type { PaginatedResponse } from '@/lib/types/pagination';
import { videoPageSchema, type VideoRow } from '@/lib/validation/video-schema';
import { fetchAndParse } from '@/utils/fetch-and-parse';

import type { InfiniteQueryOptionsOverride } from './query-options';

/** One skip/offset page of published videos returned by `/api/videos?listing=published`. */
export type PublishedVideosPaginatedResponse = PaginatedResponse<VideoRow>;

/** Page size requested per fetch — kept in sync with the SSR prefetch and service. */
export const PUBLISHED_VIDEOS_PAGE_SIZE = 5;

/**
 * Fetches one page of published, non-archived videos from the
 * `/api/videos?listing=published` route handler.
 *
 * Forwards the TanStack Query {@link AbortSignal} to `fetch` so the request is
 * cancelled automatically on unmount, invalidation, or a superseding refetch.
 *
 * @param sort - Release-date sort direction applied server-side.
 * @param skip - Offset of the page to fetch.
 * @param take - Page size to request.
 * @param signal - The query's abort signal.
 * @returns The page of videos plus the `nextSkip` cursor.
 * @throws If the response status is not OK.
 */
const fetchPublishedVideos = async (
  sort: 'asc' | 'desc',
  skip: number,
  take: number,
  signal?: AbortSignal
): Promise<PublishedVideosPaginatedResponse> => {
  const params = new URLSearchParams({
    listing: 'published',
    skip: String(skip),
    take: String(take),
    sort,
  });

  return fetchAndParse(`/api/videos?${params.toString()}`, videoPageSchema, {
    signal,
    errorMessage: 'Failed to fetch videos',
  });
};

/**
 * React Query infinite hook for the signed-in public videos listing.
 *
 * Pages through the published-videos endpoint via skip/offset, accumulating
 * results for infinite scroll. `sort` is applied server-side and is part of the
 * query key, so changing it resets pagination; `keepPreviousData` keeps the
 * current results visible during a sort transition.
 *
 * @param sort - Release-date sort direction (defaults to newest first).
 * @param options - Caller overrides spread into the `useInfiniteQuery` call
 * (e.g. `enabled`, `staleTime`); they take precedence over the defaults below.
 * @returns The TanStack `useInfiniteQuery` result (`data.pages`, `fetchNextPage`, etc.).
 */
export const useInfinitePublishedVideosQuery = (
  sort: 'asc' | 'desc' = 'desc',
  options: InfiniteQueryOptionsOverride<PublishedVideosPaginatedResponse> = {}
) =>
  useInfiniteQuery({
    queryKey: queryKeys.videos.publishedInfinite(sort),
    queryFn: ({ pageParam, signal }) =>
      fetchPublishedVideos(sort, pageParam, PUBLISHED_VIDEOS_PAGE_SIZE, signal),
    initialPageParam: 0,
    getNextPageParam: (lastPage) => lastPage.nextSkip,
    placeholderData: keepPreviousData,
    ...options,
  });
