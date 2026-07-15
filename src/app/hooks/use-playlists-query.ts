/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { useInfiniteQuery } from '@tanstack/react-query';

import { PLAYLISTS_PAGE_SIZE } from '@/lib/constants/playlists';
import { queryKeys } from '@/lib/query-keys';
import type { PlaylistListRow, PlaylistsResponse } from '@/lib/types/domain/playlist';
import { playlistsResponseSchema } from '@/lib/validation/playlist-schema';

import { fetchAndParse } from './fetch-and-parse';

import type { InfiniteQueryOptionsOverride } from './query-options';

/**
 * Fetches one skip/offset page of the signed-in user's playlists from the
 * `/api/playlists` route handler, validating the body against
 * `playlistsResponseSchema`.
 *
 * Forwards the TanStack Query {@link AbortSignal} to `fetch` so the request is
 * cancelled automatically on unmount, invalidation, or a superseding refetch.
 *
 * @param skip - Offset of the page to fetch.
 * @param signal - The TanStack Query `AbortSignal` used to cancel the request.
 * @returns The parsed playlist rows plus the `nextSkip` pagination cursor.
 * @throws If the response status is not OK, or the body fails validation.
 */
const fetchPlaylists = async (skip: number, signal?: AbortSignal): Promise<PlaylistsResponse> =>
  fetchAndParse(
    `/api/playlists?skip=${skip}&take=${PLAYLISTS_PAGE_SIZE}`,
    playlistsResponseSchema,
    {
      signal,
      errorMessage: 'Failed to fetch playlists',
    }
  );

/** Result of {@link usePlaylistsQuery} — the infinite list surface. */
export interface UsePlaylistsQueryResult {
  isPending: boolean;
  error: Error;
  /** All rows across loaded pages; undefined until the first page settles successfully. */
  rows: PlaylistListRow[] | undefined;
  /** Cursor of the next page; null when the last loaded page is final. */
  nextSkip: number | null;
  /** Fetches the next page (no-op while a page fetch is already in flight). */
  loadMore: () => void;
  isLoadingMore: boolean;
  refetch: () => void;
}

/**
 * React Query infinite hook for the signed-in user's My Playlists list.
 *
 * Pages through `/api/playlists` via the `nextSkip` cursor, accumulating loaded
 * pages under the stable `playlists.mine()` key. `rows` flattens every loaded
 * page, so downstream search and pickers match across all loaded pages;
 * `nextSkip` mirrors the LAST loaded page's cursor (null on the final page).
 * `loadMore` appends the next page and is a no-op while one is already in
 * flight. Cancellation is handled automatically via the forwarded `AbortSignal`.
 *
 * @param options - Caller overrides spread into the `useInfiniteQuery` call
 * (e.g. `enabled`, `staleTime`); `queryKey`/`queryFn` and pagination stay locked.
 * @returns The list surface: `isPending`, `error` (defaulted when unknown),
 * flattened `rows`, `nextSkip`, `loadMore`, `isLoadingMore`, and `refetch`.
 */
export const usePlaylistsQuery = (
  options: InfiniteQueryOptionsOverride<PlaylistsResponse> = {}
): UsePlaylistsQueryResult => {
  const { isPending, error, data, refetch, fetchNextPage, isFetchingNextPage } = useInfiniteQuery({
    queryKey: queryKeys.playlists.mine(),
    queryFn: ({ pageParam, signal }) => fetchPlaylists(pageParam, signal),
    initialPageParam: 0,
    getNextPageParam: (lastPage) => lastPage.nextSkip,
    ...options,
  });

  const loadMore = (): void => {
    if (!isFetchingNextPage) void fetchNextPage();
  };

  return {
    isPending,
    error: error ?? Error('Unknown error'),
    rows: data?.pages.flatMap((page) => page.rows),
    nextSkip: data?.pages.at(-1)?.nextSkip ?? null,
    loadMore,
    isLoadingMore: isFetchingNextPage,
    refetch: () => void refetch(),
  };
};
