/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { useQuery, type QueryFunctionContext } from '@tanstack/react-query';

import { queryKeys } from '@/lib/query-keys';

import type { Artist, Tour, TourDate, TourDateHeadliner, TourImage, Venue } from '@prisma/client';

type TourWithRelations = Tour & {
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

export interface ToursResponse {
  tours: TourWithRelations[];
  count: number;
}

/**
 * Fetches the list of tours from the `/api/tours` route handler.
 *
 * Forwards the TanStack Query {@link AbortSignal} to `fetch` so the request is
 * cancelled automatically on unmount, invalidation, or a superseding refetch.
 *
 * @param context - The TanStack Query function context, providing the `signal`.
 * @returns The parsed JSON response containing the tours and count.
 * @throws If the response status is not OK.
 */
const fetchTours = async ({ signal }: QueryFunctionContext): Promise<ToursResponse> => {
  const response = await fetch('/api/tours', { signal });
  if (!response.ok) {
    throw Error('Failed to fetch tours');
  }
  return response.json() as Promise<ToursResponse>;
};

/**
 * React Query hook for fetching the list of tours.
 *
 * Wraps {@link fetchTours} with a stable query key and exposes the request
 * state. Cancellation is handled automatically via the forwarded `AbortSignal`.
 *
 * @returns The query state: `isPending`, `error` (defaulted when unknown),
 * `data`, and `refetch`.
 */
export const useToursQuery = () => {
  const {
    isPending,
    error = Error('Unknown error'),
    data,
    refetch,
  } = useQuery({
    queryKey: queryKeys.tours.list(),
    queryFn: fetchTours,
  });

  return { isPending, error, data, refetch };
};
