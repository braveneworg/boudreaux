/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { useQuery } from '@tanstack/react-query';

import { queryKeys } from '@/lib/query-keys';
import type { PlaylistDetailResponse } from '@/lib/types/domain/playlist';
import { playlistDetailResponseSchema } from '@/lib/validation/playlist-schema';

import { fetchAndParse } from './fetch-and-parse';

import type { QueryOptionsOverride } from './query-options';

/**
 * Fetches a single playlist (with resolved items) from the
 * `/api/playlists/[id]` route handler, validating the body against
 * `playlistDetailResponseSchema`.
 *
 * Forwards the TanStack Query {@link AbortSignal} to `fetch` so the request is
 * cancelled automatically on unmount, invalidation, or a superseding refetch.
 *
 * @param playlistId - The playlist identifier to fetch.
 * @param signal - The TanStack Query `AbortSignal` used to cancel the request.
 * @returns The parsed playlist detail including its resolved items.
 * @throws If the response status is not OK, or the body fails validation.
 */
const fetchPlaylist = async (
  playlistId: string,
  signal?: AbortSignal
): Promise<PlaylistDetailResponse> =>
  fetchAndParse(`/api/playlists/${encodeURIComponent(playlistId)}`, playlistDetailResponseSchema, {
    signal,
    errorMessage: 'Failed to fetch playlist',
  });

/**
 * React Query hook for a single playlist's detail (title, covers, and
 * resolved items).
 *
 * Items include per-request stream fields (`s3Key`/`streamUrl`/`posterUrl`):
 * tracks carry an unsigned CDN URL, videos a CloudFront-signed URL (24h) with
 * the raw key withheld.
 *
 * Wraps {@link fetchPlaylist} with the stable `playlists.detail(id)` key and
 * exposes the request state. The query is disabled while `playlistId` is
 * `null` (e.g. no playlist selected yet). Cancellation is handled
 * automatically via the forwarded `AbortSignal`.
 *
 * @param playlistId - The playlist to fetch, or `null` to keep the query idle.
 * @param options - Caller overrides spread into the `useQuery` call (e.g.
 * `enabled`, `staleTime`); the non-null-id gate is always applied on top.
 * @returns The query state: `isPending`, `error` (defaulted when unknown),
 * `data`, and `refetch`.
 */
export const usePlaylistQuery = (
  playlistId: string | null,
  options: QueryOptionsOverride<PlaylistDetailResponse> = {}
) => {
  const {
    isPending,
    error = Error('Unknown error'),
    data,
    refetch,
  } = useQuery({
    queryKey: queryKeys.playlists.detail(playlistId ?? ''),
    queryFn: ({ signal }) => fetchPlaylist(playlistId ?? '', signal),
    ...options,
    enabled: (options.enabled ?? true) && !!playlistId,
  });

  return { isPending, error, data, refetch };
};
