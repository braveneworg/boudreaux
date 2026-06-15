/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { z } from 'zod';

import { queryKeys } from '@/lib/query-keys';

import { fetchAndParse } from './fetch-and-parse';

import type { QueryOptionsOverride } from './query-options';

interface VenueSearchItem {
  id: string;
  name: string;
  city: string | null;
  state: string | null;
  timeZone: string | null;
}

const venueSearchItemSchema = z.object({
  id: z.string(),
  name: z.string(),
  city: z.string().nullable(),
  state: z.string().nullable(),
  timeZone: z.string().nullable(),
}) satisfies z.ZodType<VenueSearchItem>;

const venueSearchResponseSchema = z.object({
  venues: z.array(venueSearchItemSchema),
});

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

  const { venues } = await fetchAndParse(url, venueSearchResponseSchema, {
    signal,
    errorMessage: 'Failed to fetch venues',
  });
  return venues;
};

/**
 * React Query hook for searching venues.
 *
 * Wraps {@link fetchVenueSearch} with a stable query key and exposes the
 * request state, keeping previous data while a new search resolves. Cancellation
 * is handled automatically via the forwarded `AbortSignal`.
 *
 * @param search - The case-insensitive substring to filter venues by.
 * @param options - Caller overrides spread into the `useQuery` call (e.g.
 * `enabled`); they take precedence over the defaults below.
 * @returns The query state: `isPending`, `error` (defaulted when unknown),
 * `data`, and `refetch`.
 */
export const useVenueSearchQuery = (
  search: string,
  options: QueryOptionsOverride<VenueSearchItem[]> = {}
) => {
  const {
    isPending,
    error = Error('Unknown error'),
    data,
    refetch,
  } = useQuery({
    queryKey: queryKeys.venues.search(search),
    queryFn: ({ signal }) => fetchVenueSearch(search, signal),
    placeholderData: keepPreviousData,
    ...options,
  });

  return { isPending, error, data, refetch };
};
