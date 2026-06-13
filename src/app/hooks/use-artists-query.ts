/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { useQuery, type QueryFunctionContext } from '@tanstack/react-query';

import { queryKeys } from '@/lib/query-keys';

/**
 * Fetches the list of artists from the `/api/artists` route handler.
 *
 * Forwards the TanStack Query {@link AbortSignal} to `fetch` so the request is
 * cancelled automatically on unmount, invalidation, or a superseding refetch.
 *
 * @param context - The TanStack Query function context, providing the `signal`.
 * @returns The parsed JSON response containing the artists.
 * @throws If the response status is not OK.
 */
const fetchArtists = async ({ signal }: QueryFunctionContext) => {
  const response = await fetch('/api/artists', { signal });
  if (!response.ok) {
    throw Error('Failed to fetch artists');
  }
  return response.json();
};

/**
 * React Query hook for fetching the list of artists.
 *
 * Wraps {@link fetchArtists} with a stable query key and exposes the request
 * state. Cancellation is handled automatically via the forwarded `AbortSignal`.
 *
 * @returns The query state: `isPending`, `error` (defaulted when unknown),
 * `data`, and `refetch`.
 */
export const useArtistsQuery = () => {
  const {
    isPending,
    error = Error('Unknown error'),
    data,
    refetch,
  } = useQuery({
    queryKey: queryKeys.artists.list(),
    queryFn: fetchArtists,
  });

  return { isPending, error, data, refetch };
};
