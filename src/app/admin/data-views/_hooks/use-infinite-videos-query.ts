/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { keepPreviousData, useInfiniteQuery } from '@tanstack/react-query';

import type { InfiniteQueryOptionsOverride } from '@/hooks/query-options';
import { queryKeys } from '@/lib/query-keys';
import type { PaginatedResponse } from '@/lib/types/pagination';
import { videoPageSchema, type VideoRow } from '@/lib/validation/video-schema';
import { fetchAndParse } from '@/utils/fetch-and-parse';

/** Filters that drive the admin videos infinite query. */
export interface VideosQueryParams {
  search: string;
  published: boolean | null;
  archived: boolean;
  sort: 'asc' | 'desc';
}

/** One skip/offset page of videos returned by `/api/videos` (admin listing). */
export type VideosPaginatedResponse = PaginatedResponse<VideoRow>;

/** Page size requested per fetch. */
export const VIDEOS_PAGE_SIZE = 5;

/**
 * Fetches one page of videos from the `/api/videos` route handler (admin
 * listing — no `listing` param).
 *
 * Forwards the TanStack Query {@link AbortSignal} to `fetch` so the request is
 * cancelled automatically on unmount, invalidation, or a superseding refetch.
 * Absent filters are omitted from the URL so the server applies its defaults.
 *
 * @param params - Server-side search/published/archived/sort filters.
 * @param skip - Offset of the page to fetch.
 * @param signal - The query's abort signal.
 * @returns The page of videos plus the `nextSkip` cursor.
 * @throws If the response status is not OK.
 */
const fetchVideos = async (
  params: VideosQueryParams,
  skip: number,
  signal?: AbortSignal
): Promise<VideosPaginatedResponse> => {
  const searchParams = new URLSearchParams({
    skip: String(skip),
    take: String(VIDEOS_PAGE_SIZE),
    sort: params.sort,
  });
  if (params.search) searchParams.set('search', params.search);
  if (params.published !== null) searchParams.set('published', String(params.published));
  if (params.archived) searchParams.set('archived', 'true');

  return fetchAndParse(`/api/videos?${searchParams.toString()}`, videoPageSchema, {
    signal,
    errorMessage: 'Failed to fetch videos',
  });
};

/**
 * React Query infinite hook for the admin videos listing.
 *
 * Pages through `/api/videos` via skip/offset, accumulating results for
 * infinite scroll. Search, published, archived, and sort filters are applied
 * server-side and are part of the query key, so changing any of them resets
 * pagination. `keepPreviousData` keeps the current results visible during a
 * filter transition. Cancellation is automatic via the forwarded `AbortSignal`.
 *
 * @param params - The server-side search/published/archived/sort filters.
 * @param options - Caller overrides spread into the `useInfiniteQuery` call
 * (e.g. `enabled`, `staleTime`); they take precedence over the defaults below.
 * @returns The TanStack `useInfiniteQuery` result (`data.pages`, `fetchNextPage`, etc.).
 */
export const useInfiniteVideosQuery = (
  params: VideosQueryParams,
  options: InfiniteQueryOptionsOverride<VideosPaginatedResponse> = {}
) =>
  useInfiniteQuery({
    queryKey: queryKeys.videos.adminInfinite(params),
    queryFn: ({ pageParam, signal }) => fetchVideos(params, pageParam, signal),
    initialPageParam: 0,
    getNextPageParam: (lastPage) => lastPage.nextSkip,
    placeholderData: keepPreviousData,
    ...options,
  });
