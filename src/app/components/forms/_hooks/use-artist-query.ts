/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { useQuery } from '@tanstack/react-query';
import { type z } from 'zod';

import type { QueryOptionsOverride } from '@/hooks/query-options';
import { queryKeys } from '@/lib/query-keys';
import { artistDetailSchema } from '@/lib/validation/media/artist-schema';
import { fetchAndParse } from '@/utils/fetch-and-parse';

/** The parsed `Artist` shape returned by `GET /api/artists/[id]`. */
export type ArtistDetail = z.infer<typeof artistDetailSchema>;

/**
 * Fetches a single artist from the `/api/artists/[id]` route handler.
 *
 * The route returns the artist object directly (not wrapped), so the body is
 * validated as-is. Forwards the TanStack Query {@link AbortSignal} to `fetch`
 * so the request is cancelled automatically on unmount, invalidation, or a
 * superseding refetch.
 *
 * @param artistId - The artist identifier to fetch.
 * @param signal - The `AbortSignal` forwarded from TanStack Query.
 * @returns The parsed artist detail, or `null` when not found (404).
 * @throws If the response status is not OK (other than 404).
 */
export const fetchArtistById = async (
  artistId: string,
  signal?: AbortSignal
): Promise<ArtistDetail | null> =>
  fetchAndParse(`/api/artists/${encodeURIComponent(artistId)}`, artistDetailSchema, {
    signal,
    errorMessage: 'Failed to fetch artist',
    fallbackByStatus: { 404: null },
  });

/**
 * React Query hook for fetching a single artist by id.
 *
 * Wraps {@link fetchArtistById} with a stable query key and exposes the request
 * state. Cancellation is handled automatically via the forwarded `AbortSignal`.
 *
 * @param artistId - The artist identifier to fetch.
 * @param options - Caller overrides spread into the `useQuery` call (e.g.
 * `enabled`); the non-empty-artistId gate is always applied on top.
 * @returns The query state: `isPending`, `isError`, `error` (defaulted when
 * unknown), `data`, and `refetch`.
 */
export const useArtistQuery = (
  artistId: string,
  options: QueryOptionsOverride<ArtistDetail | null> = {}
) => {
  const {
    isPending,
    isError,
    error = Error('Unknown error'),
    data,
    refetch,
  } = useQuery({
    queryKey: queryKeys.artists.detail(artistId),
    queryFn: ({ signal }) => fetchArtistById(artistId, signal),
    ...options,
    enabled: (options.enabled ?? true) && !!artistId,
  });

  return { isPending, isError, error, data, refetch };
};
