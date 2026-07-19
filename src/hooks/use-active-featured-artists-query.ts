/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { useQuery, type QueryFunctionContext } from '@tanstack/react-query';
import { z } from 'zod';

import type { QueryOptionsOverride } from '@/hooks/query-options';
import { queryKeys } from '@/lib/query-keys';
import type { FeaturedArtist } from '@/lib/types/media-models';
import { featuredArtistSchema } from '@/lib/validation/media-models-schema';
import { fetchAndParse } from '@/utils/fetch-and-parse';

export interface ActiveFeaturedArtistsResponse {
  featuredArtists: FeaturedArtist[];
  count: number;
}

const activeFeaturedArtistsResponseSchema = z.object({
  featuredArtists: z.array(featuredArtistSchema),
  count: z.number(),
}) satisfies z.ZodType<ActiveFeaturedArtistsResponse>;

/**
 * Fetches the active featured artists from the `/api/featured-artists` route handler.
 *
 * Forwards the TanStack Query {@link AbortSignal} to `fetch` so the request is
 * cancelled automatically on unmount, invalidation, or a superseding refetch.
 *
 * @param context - The TanStack Query function context, providing the `signal`.
 * @returns The parsed JSON response containing the featured artists and count.
 * @throws If the response status is not OK.
 */
const fetchActiveFeaturedArtists = async ({
  signal,
}: QueryFunctionContext): Promise<ActiveFeaturedArtistsResponse> =>
  fetchAndParse('/api/featured-artists?active=true&limit=7', activeFeaturedArtistsResponseSchema, {
    signal,
    errorMessage: 'Failed to fetch featured artists',
  });

/**
 * React Query hook for fetching the active featured artists.
 *
 * Wraps {@link fetchActiveFeaturedArtists} with a stable query key and exposes
 * the request state. Cancellation is handled automatically via the forwarded
 * `AbortSignal`.
 *
 * @param options - Caller overrides spread into the `useQuery` call (e.g.
 * `enabled`, `staleTime`).
 * @returns The query state: `isPending`, `error` (defaulted when unknown),
 * `data`, and `refetch`.
 */
export const useActiveFeaturedArtistsQuery = (
  options: QueryOptionsOverride<ActiveFeaturedArtistsResponse> = {}
) => {
  const {
    isPending,
    error = Error('Unknown error'),
    data,
    refetch,
  } = useQuery({
    queryKey: queryKeys.featuredArtists.active(),
    queryFn: fetchActiveFeaturedArtists,
    ...options,
  });

  return { isPending, error, data, refetch };
};
