/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { useQuery } from '@tanstack/react-query';

import { queryKeys } from '@/lib/query-keys';

import type { QueryOptionsOverride } from './query-options';

interface VenueDetail {
  id: string;
  name: string;
  address: string | null;
  city: string | null;
  state: string | null;
  postalCode: string | null;
  country: string | null;
  timeZone: string | null;
}

/**
 * Fetches a single venue from the `/api/venues/[venueId]` route handler.
 *
 * Forwards the TanStack Query {@link AbortSignal} to `fetch` so the request is
 * cancelled automatically on unmount, invalidation, or a superseding refetch.
 *
 * @param venueId - The venue identifier to fetch.
 * @param signal - The `AbortSignal` forwarded from TanStack Query.
 * @returns The parsed venue detail.
 * @throws If the response status is not OK.
 */
const fetchVenueDetail = async (venueId: string, signal?: AbortSignal): Promise<VenueDetail> => {
  const response = await fetch(`/api/venues/${venueId}`, { signal });
  if (!response.ok) {
    throw Error('Failed to fetch venue details');
  }
  const json = (await response.json()) as { venue: VenueDetail };
  return json.venue;
};

/**
 * React Query hook for fetching a single venue's details.
 *
 * Wraps {@link fetchVenueDetail} with a stable query key and exposes the
 * request state. Cancellation is handled automatically via the forwarded
 * `AbortSignal`.
 *
 * @param venueId - The venue identifier to fetch.
 * @param options - Caller overrides spread into the `useQuery` call (e.g.
 * `enabled`); the non-empty-venueId gate is always applied on top.
 * @returns The query state: `isPending`, `error` (defaulted when unknown),
 * `data`, and `refetch`.
 */
export const useVenueDetailQuery = (
  venueId: string,
  options: QueryOptionsOverride<VenueDetail> = {}
) => {
  const {
    isPending,
    error = Error('Unknown error'),
    data,
    refetch,
  } = useQuery({
    queryKey: queryKeys.venues.detail(venueId),
    queryFn: ({ signal }) => fetchVenueDetail(venueId, signal),
    ...options,
    enabled: (options.enabled ?? true) && !!venueId,
  });

  return { isPending, error, data, refetch };
};
