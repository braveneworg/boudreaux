/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { keepPreviousData, useQuery } from '@tanstack/react-query';

import { PLAYLIST_SEARCH_MIN_QUERY_LENGTH } from '@/lib/constants/playlists';
import { queryKeys } from '@/lib/query-keys';
import type { PlaylistSearchResponse } from '@/lib/types/domain/playlist';
import { playlistSearchResponseSchema } from '@/lib/validation/playlist-schema';

import { fetchAndParse } from './fetch-and-parse';

import type { QueryOptionsOverride } from './query-options';

/**
 * Searches tracks, videos, and public playlists for the playlist creator via
 * the `/api/playlists/media-search` route handler, validating the body
 * against `playlistSearchResponseSchema`.
 *
 * Forwards the TanStack Query {@link AbortSignal} to `fetch` so the request is
 * cancelled automatically on unmount, invalidation, or a superseding refetch.
 *
 * @param q - The search term to match media against (URL-encoded).
 * @param signal - The TanStack Query `AbortSignal` used to cancel the request.
 * @returns The parsed grouped search results.
 * @throws If the response status is not OK, or the body fails validation.
 */
const fetchPlaylistMediaSearch = async (
  q: string,
  signal?: AbortSignal
): Promise<PlaylistSearchResponse> =>
  fetchAndParse(
    `/api/playlists/media-search?q=${encodeURIComponent(q)}`,
    playlistSearchResponseSchema,
    { signal, errorMessage: 'Failed to search media' }
  );

/**
 * React Query hook for the playlist creator's media-search typeahead.
 *
 * Wraps {@link fetchPlaylistMediaSearch} with the stable
 * `playlists.mediaSearch(q)` key. Previous results are kept as placeholder
 * data while a new term loads, and results stay fresh for 30 seconds so
 * retyping a recent term does not refetch. Cancellation is handled
 * automatically via the forwarded `AbortSignal`.
 *
 * @param q - The search term; the query is disabled until the trimmed term
 * reaches {@link PLAYLIST_SEARCH_MIN_QUERY_LENGTH} characters.
 * @param options - Caller overrides spread into the `useQuery` call (e.g.
 * `enabled`, `staleTime`); the minimum-length gate is always applied on top.
 * @returns The query state: `isPending`, `error` (defaulted when unknown),
 * `data`, and `refetch`.
 */
export const usePlaylistMediaSearchQuery = (
  q: string,
  options: QueryOptionsOverride<PlaylistSearchResponse> = {}
) => {
  const {
    isPending,
    error = Error('Unknown error'),
    data,
    refetch,
  } = useQuery({
    queryKey: queryKeys.playlists.mediaSearch(q),
    queryFn: ({ signal }) => fetchPlaylistMediaSearch(q, signal),
    placeholderData: keepPreviousData,
    staleTime: 30_000,
    ...options,
    enabled: (options.enabled ?? true) && q.trim().length >= PLAYLIST_SEARCH_MIN_QUERY_LENGTH,
  });

  return { isPending, error, data, refetch };
};
