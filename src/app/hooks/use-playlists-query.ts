/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { useQuery } from '@tanstack/react-query';

import { PLAYLISTS_PAGE_SIZE } from '@/lib/constants/playlists';
import { queryKeys } from '@/lib/query-keys';
import type { PlaylistsResponse } from '@/lib/types/domain/playlist';
import { playlistsResponseSchema } from '@/lib/validation/playlist-schema';

import { fetchAndParse } from './fetch-and-parse';

import type { QueryOptionsOverride } from './query-options';

/**
 * Fetches the first page of the signed-in user's playlists from the
 * `/api/playlists` route handler, validating the body against
 * `playlistsResponseSchema`.
 *
 * Forwards the TanStack Query {@link AbortSignal} to `fetch` so the request is
 * cancelled automatically on unmount, invalidation, or a superseding refetch.
 *
 * @param signal - The TanStack Query `AbortSignal` used to cancel the request.
 * @returns The parsed playlist rows plus the `nextSkip` pagination cursor.
 * @throws If the response status is not OK, or the body fails validation.
 */
const fetchPlaylists = async (signal?: AbortSignal): Promise<PlaylistsResponse> =>
  fetchAndParse(`/api/playlists?skip=0&take=${PLAYLISTS_PAGE_SIZE}`, playlistsResponseSchema, {
    signal,
    errorMessage: 'Failed to fetch playlists',
  });

/**
 * React Query hook for the signed-in user's My Playlists list.
 *
 * Wraps {@link fetchPlaylists} with the stable `playlists.mine()` key and
 * exposes the request state. Cancellation is handled automatically via the
 * forwarded `AbortSignal`.
 *
 * @param options - Caller overrides spread into the `useQuery` call (e.g.
 * `enabled`, `staleTime`); `queryKey`/`queryFn` stay locked.
 * @returns The query state: `isPending`, `error` (defaulted when unknown),
 * `data`, and `refetch`.
 */
export const usePlaylistsQuery = (options: QueryOptionsOverride<PlaylistsResponse> = {}) => {
  const {
    isPending,
    error = Error('Unknown error'),
    data,
    refetch,
  } = useQuery({
    queryKey: queryKeys.playlists.mine(),
    queryFn: ({ signal }) => fetchPlaylists(signal),
    ...options,
  });

  return { isPending, error, data, refetch };
};
