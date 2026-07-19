/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { useQuery } from '@tanstack/react-query';

import { queryKeys } from '@/lib/query-keys';
import type { FeaturedArtist } from '@/lib/types/media-models';
import { featuredArtistSchema } from '@/lib/validation/media-models-schema';
import { parseResponse } from '@/utils/fetch-and-parse';

import type { QueryOptionsOverride } from './query-options';

/**
 * Fetches a single featured artist from the `/api/featured-artists/[id]` route
 * handler.
 *
 * The route returns the featured-artist object directly (not wrapped), so the
 * body is validated as-is. Forwards the TanStack Query {@link AbortSignal} to
 * `fetch` so the request is cancelled automatically on unmount, invalidation,
 * or a superseding refetch.
 *
 * @param featuredArtistId - The featured-artist identifier to fetch.
 * @param signal - The `AbortSignal` forwarded from TanStack Query.
 * @returns The parsed featured artist, or `null` when not found (404).
 * @throws If the response status is not OK (other than 404).
 */
const fetchFeaturedArtist = async (
  featuredArtistId: string,
  signal?: AbortSignal
): Promise<FeaturedArtist | null> => {
  const url = `/api/featured-artists/${encodeURIComponent(featuredArtistId)}`;
  const response = await fetch(url, { signal });
  if (!response.ok) {
    if (response.status === 404) {
      return null;
    }
    throw Error('Failed to fetch featured artist');
  }
  return parseResponse(url, featuredArtistSchema, await response.json());
};

/**
 * React Query hook for fetching a single featured artist by id.
 *
 * Wraps {@link fetchFeaturedArtist} with a stable query key and exposes the
 * request state. Cancellation is handled automatically via the forwarded
 * `AbortSignal`.
 *
 * @param featuredArtistId - The featured-artist identifier to fetch.
 * @param options - Caller overrides spread into the `useQuery` call (e.g.
 * `enabled`); the non-empty-id gate is always applied on top.
 * @returns The query state: `isPending`, `isError`, `error` (defaulted when
 * unknown), `data`, and `refetch`.
 */
export const useFeaturedArtistQuery = (
  featuredArtistId: string,
  options: QueryOptionsOverride<FeaturedArtist | null> = {}
) => {
  const {
    isPending,
    isError,
    error = Error('Unknown error'),
    data,
    refetch,
  } = useQuery({
    queryKey: queryKeys.featuredArtists.detail(featuredArtistId),
    queryFn: ({ signal }) => fetchFeaturedArtist(featuredArtistId, signal),
    ...options,
    enabled: (options.enabled ?? true) && !!featuredArtistId,
  });

  return { isPending, isError, error, data, refetch };
};
