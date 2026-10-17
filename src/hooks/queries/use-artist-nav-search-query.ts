/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { z } from 'zod';

import type { QueryOptionsOverride } from '@/hooks/query-options';
import { queryKeys } from '@/lib/query-keys';
import { fetchAndParse } from '@/utils/fetch-and-parse';

/** A release row: its cover, the first track a pick plays, and its year. */
export interface ArtistNavSearchRelease {
  id: string;
  title: string;
  coverArtSrc: string | null;
  playSrc: string | null;
  year: number;
}

/** A video row: its poster, the signed stream URL a pick plays, and its year. */
export interface ArtistNavSearchVideo {
  id: string;
  title: string;
  posterSrc: string | null;
  streamUrl: string | null;
  year: number;
  durationSeconds: number | null;
}

/** One artist of the home search, with its playable releases and live videos. */
export interface ArtistNavSearchResult {
  artistSlug: string;
  artistName: string;
  thumbnailSrc: string | null;
  releases: ArtistNavSearchRelease[];
  videos: ArtistNavSearchVideo[];
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
          coverArtSrc: z.string().nullable(),
          playSrc: z.string().nullable(),
          year: z.number().int(),
        })
      ),
      videos: z.array(
        z.object({
          id: z.string(),
          title: z.string(),
          posterSrc: z.string().nullable(),
          streamUrl: z.string().nullable(),
          year: z.number().int(),
          durationSeconds: z.number().nullable(),
        })
      ),
    })
  ),
}) satisfies z.ZodType<ArtistNavSearchResponse>;

/**
 * Searches the home page's artists, releases and videos via the
 * `/api/artists/search` route handler.
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
 * React Query hook for the home page search (artists, their playable
 * releases and their live videos).
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
