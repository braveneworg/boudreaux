/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { z } from 'zod';

import type { QueryOptionsOverride } from '@/hooks/query-options';
import { queryKeys } from '@/lib/query-keys';
import { fetchAndParse } from '@/utils/fetch-and-parse';

interface ArtistNavSearchResult {
  artistSlug: string;
  artistName: string;
  thumbnailSrc: string | null;
  releases: Array<{ id: string; title: string }>;
}

interface ArtistNavSearchResponse {
  results: ArtistNavSearchResult[];
}

const artistNavSearchResponseSchema = z.object({
  results: z.array(
    z.object({
      artistSlug: z.string(),
      artistName: z.string(),
      thumbnailSrc: z.string().nullable(),
      releases: z.array(
        z.object({
          id: z.string(),
          title: z.string(),
        })
      ),
    })
  ),
}) satisfies z.ZodType<ArtistNavSearchResponse>;

/**
 * Searches artists for the nav typeahead via the `/api/artists/search` route
 * handler.
 *
 * Forwards the TanStack Query {@link AbortSignal} to `fetch` so the request is
 * cancelled automatically on unmount, invalidation, or a superseding refetch.
 *
 * @param query - The search term to match artists against.
 * @param signal - The TanStack Query `AbortSignal` used to cancel the request.
 * @returns The parsed JSON response containing the search results.
 * @throws If the response status is not OK.
 */
const fetchArtistNavSearch = async (
  query: string,
  signal?: AbortSignal
): Promise<ArtistNavSearchResponse> => {
  return fetchAndParse(
    `/api/artists/search?q=${encodeURIComponent(query)}`,
    artistNavSearchResponseSchema,
    { signal, errorMessage: 'Failed to search artists' }
  );
};

/**
 * React Query hook for the nav artist-search typeahead.
 *
 * Wraps {@link fetchArtistNavSearch} with a stable query key and exposes the
 * request state. Cancellation is handled automatically via the forwarded
 * `AbortSignal`.
 *
 * @param query - The search term; the query is disabled until at least 3
 * characters are entered.
 * @param options - Caller overrides spread into the `useQuery` call (e.g.
 * `enabled`); the 3-character gate is always applied on top.
 * @returns The query state: `isPending`, `error` (defaulted when unknown),
 * `data`, and `refetch`.
 */
export const useArtistNavSearchQuery = (
  query: string,
  options: QueryOptionsOverride<ArtistNavSearchResponse> = {}
) => {
  const {
    isPending,
    error = Error('Unknown error'),
    data,
    refetch,
  } = useQuery({
    queryKey: queryKeys.artists.search(query),
    queryFn: ({ signal }) => fetchArtistNavSearch(query, signal),
    placeholderData: keepPreviousData,
    ...options,
    enabled: (options.enabled ?? true) && query.length >= 3,
  });

  return { isPending, error, data, refetch };
};
