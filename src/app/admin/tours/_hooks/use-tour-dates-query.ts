/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { useQuery } from '@tanstack/react-query';
import { z } from 'zod';

import type { QueryOptionsOverride } from '@/hooks/query-options';
import { queryKeys } from '@/lib/query-keys';
import { fetchAndParse } from '@/utils/fetch-and-parse';

export interface TourDatesResponse {
  tourDates: Array<Record<string, unknown>>;
}

const tourDatesResponseSchema = z.object({
  tourDates: z.array(z.record(z.string(), z.unknown())),
}) satisfies z.ZodType<TourDatesResponse>;

/**
 * Fetches the dates for a tour from the `/api/tours/[tourId]/dates` route handler.
 *
 * Forwards the TanStack Query {@link AbortSignal} to `fetch` so the request is
 * cancelled automatically on unmount, invalidation, or a superseding refetch.
 *
 * @param tourId - The tour identifier to fetch dates for.
 * @param signal - The `AbortSignal` forwarded from TanStack Query.
 * @returns The parsed JSON response containing the tour dates.
 * @throws If the response status is not OK.
 */
const fetchTourDates = async (tourId: string, signal?: AbortSignal): Promise<TourDatesResponse> => {
  return fetchAndParse(`/api/tours/${tourId}/dates`, tourDatesResponseSchema, {
    signal,
    cache: 'no-store',
    errorMessage: 'Failed to fetch tour dates',
  });
};

/**
 * React Query hook for fetching the dates for a tour.
 *
 * Wraps {@link fetchTourDates} with a stable query key and exposes the request
 * state. Cancellation is handled automatically via the forwarded `AbortSignal`.
 *
 * @param tourId - The tour identifier to fetch dates for.
 * @param options - Caller overrides spread into the `useQuery` call (e.g.
 * `enabled`); the non-empty-tourId gate is always applied on top.
 * @returns The query state: `isPending`, `error` (defaulted when unknown),
 * `data`, and `refetch`.
 */
export const useTourDatesQuery = (
  tourId: string,
  options: QueryOptionsOverride<TourDatesResponse> = {}
) => {
  const {
    isPending,
    error = Error('Unknown error'),
    data,
    refetch,
  } = useQuery({
    queryKey: queryKeys.tours.dates(tourId),
    queryFn: ({ signal }) => fetchTourDates(tourId, signal),
    ...options,
    enabled: (options.enabled ?? true) && !!tourId,
  });

  return { isPending, error, data, refetch };
};
