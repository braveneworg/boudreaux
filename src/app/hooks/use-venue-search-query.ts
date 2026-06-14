/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { keepPreviousData, useQuery } from '@tanstack/react-query';

import { queryKeys } from '@/lib/query-keys';

interface VenueSearchItem {
  id: string;
  name: string;
  city: string | null;
  state: string | null;
  timeZone: string | null;
}

/**
 * Fetches matching venues from the `/api/venues` route handler.
 *
 * Forwards the TanStack Query {@link AbortSignal} to `fetch` so the request is
 * cancelled automatically on unmount, invalidation, or a superseding refetch.
 *
 * @param search - The case-insensitive substring to filter venues by.
 * @param signal - The `AbortSignal` forwarded from TanStack Query.
 * @returns The parsed list of matching venues.
 * @throws If the response status is not OK.
 */
const fetchVenueSearch = async (
  search: string,
  signal?: AbortSignal
): Promise<VenueSearchItem[]> => {
  const params = new URLSearchParams();
  if (search) params.set('search', search);

  const queryString = params.toString();
  const url = `/api/venues${queryString ? `?${queryString}` : ''}`;

  const response = await fetch(url, { signal });
  if (!response.ok) {
    throw Error('Failed to fetch venues');
  }
  const json = (await response.json()) as { venues: VenueSearchItem[] };
  return json.venues;
};

/**
 * React Query hook for searching venues.
 *
 * Wraps {@link fetchVenueSearch} with a stable query key and exposes the
 * request state, keeping previous data while a new search resolves. Cancellation
 * is handled automatically via the forwarded `AbortSignal`.
 *
 * @param search - The case-insensitive substring to filter venues by.
 * @param enabled - Whether the query should run. Defaults to `true`.
 * @returns The query state: `isPending`, `error` (defaulted when unknown),
 * `data`, and `refetch`.
 */
export const useVenueSearchQuery = (search: string, enabled = true) => {
  const {
    isPending,
    error = Error('Unknown error'),
    data,
    refetch,
  } = useQuery({
    queryKey: queryKeys.venues.search(search),
    queryFn: ({ signal }) => fetchVenueSearch(search, signal),
    enabled,
    placeholderData: keepPreviousData,
  });

  return { isPending, error, data, refetch };
};
