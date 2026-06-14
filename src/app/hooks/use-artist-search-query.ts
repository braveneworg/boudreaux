/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { keepPreviousData, useQuery } from '@tanstack/react-query';

import { queryKeys } from '@/lib/query-keys';

import type { QueryOptionsOverride } from './query-options';

interface ArtistSearchResponse {
  artists: Array<{
    id: string;
    name: string;
    slug: string;
    imageUrl: string | null;
    firstName: string | null;
    lastName: string | null;
  }>;
}

/**
 * Searches artists (full format) via the `/api/artists/search` route handler.
 *
 * Forwards the TanStack Query {@link AbortSignal} to `fetch` so the request is
 * cancelled automatically on unmount, invalidation, or a superseding refetch.
 *
 * @param query - The search term to match artists against.
 * @param signal - The TanStack Query `AbortSignal` used to cancel the request.
 * @returns The parsed JSON response containing the search results.
 * @throws If the response status is not OK.
 */
const fetchArtistSearch = async (
  query: string,
  signal?: AbortSignal
): Promise<ArtistSearchResponse> => {
  const response = await fetch(`/api/artists/search?q=${encodeURIComponent(query)}&format=full`, {
    signal,
  });
  if (!response.ok) {
    throw Error('Failed to search artists');
  }
  return response.json() as Promise<ArtistSearchResponse>;
};

/**
 * React Query hook for full-format artist search.
 *
 * Wraps {@link fetchArtistSearch} with a stable query key and exposes the
 * request state. Cancellation is handled automatically via the forwarded
 * `AbortSignal`.
 *
 * @param query - The search term; the query is disabled while empty.
 * @param options - Caller overrides spread into the `useQuery` call (e.g.
 * `enabled`); the non-empty-query gate is always applied on top.
 * @returns The query state: `isPending`, `error` (defaulted when unknown),
 * `data`, and `refetch`.
 */
export const useArtistSearchQuery = (
  query: string,
  options: QueryOptionsOverride<ArtistSearchResponse> = {}
) => {
  const {
    isPending,
    error = Error('Unknown error'),
    data,
    refetch,
  } = useQuery({
    queryKey: queryKeys.artists.search(query),
    queryFn: ({ signal }) => fetchArtistSearch(query, signal),
    placeholderData: keepPreviousData,
    ...options,
    enabled: (options.enabled ?? true) && query.length > 0,
  });

  return { isPending, error, data, refetch };
};
