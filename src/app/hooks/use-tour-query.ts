/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { useQuery } from '@tanstack/react-query';

import { queryKeys } from '@/lib/query-keys';

import type { Artist, Tour, TourDate, TourDateHeadliner, TourImage, Venue } from '@prisma/client';

export type TourWithRelations = Tour & {
  tourDates: Array<
    TourDate & {
      venue: Venue;
      headliners: Array<
        TourDateHeadliner & {
          artist: Artist | null;
        }
      >;
    }
  >;
  images: TourImage[];
};

/**
 * Fetches a single tour from the `/api/tours/[tourId]` route handler.
 *
 * Forwards the TanStack Query {@link AbortSignal} to `fetch` so the request is
 * cancelled automatically on unmount, invalidation, or a superseding refetch.
 *
 * @param tourId - The tour identifier to fetch.
 * @param signal - The `AbortSignal` forwarded from TanStack Query.
 * @returns The parsed tour with relations, or `null` when not found (404).
 * @throws If the response status is not OK (other than 404).
 */
const fetchTour = async (
  tourId: string,
  signal?: AbortSignal
): Promise<TourWithRelations | null> => {
  const response = await fetch(`/api/tours/${encodeURIComponent(tourId)}`, { signal });
  if (!response.ok) {
    if (response.status === 404) {
      return null;
    }
    throw Error('Failed to fetch tour');
  }
  const data = await response.json();
  return (data.tour ?? data) as TourWithRelations;
};

/**
 * React Query hook for fetching a single tour.
 *
 * Wraps {@link fetchTour} with a stable query key and exposes the request
 * state. Cancellation is handled automatically via the forwarded `AbortSignal`.
 *
 * @param tourId - The tour identifier to fetch.
 * @returns The query state: `isPending`, `error` (defaulted when unknown),
 * `data`, and `refetch`.
 */
export const useTourQuery = (tourId: string) => {
  const {
    isPending,
    error = Error('Unknown error'),
    data,
    refetch,
  } = useQuery({
    queryKey: queryKeys.tours.detail(tourId),
    queryFn: ({ signal }) => fetchTour(tourId, signal),
    enabled: !!tourId,
  });

  return { isPending, error, data, refetch };
};
