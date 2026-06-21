/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { useQuery } from '@tanstack/react-query';
import { z } from 'zod';

import { queryKeys } from '@/lib/query-keys';
import { tourDateImageSchema } from '@/lib/validation/tour-models-schema';

import { fetchAndParse } from './fetch-and-parse';

import type { QueryOptionsOverride } from './query-options';

/** Strict schema for the `/api/tours/{tourId}/dates/{tourDateId}/images` response. */
const tourDateImagesResponseSchema = z.object({ images: z.array(tourDateImageSchema) });

/** The parsed `{ images }` response returned by the tour-date-images route. */
export type TourDateImagesResponse = z.infer<typeof tourDateImagesResponseSchema>;

/**
 * Fetches a tour date's images from the
 * `/api/tours/{tourId}/dates/{tourDateId}/images` route handler.
 *
 * The route always responds 200 with `{ images: [] }`, so no 404 special-casing
 * is needed. Forwards the TanStack Query {@link AbortSignal} to `fetch` so the
 * request is cancelled automatically on unmount, invalidation, or a superseding
 * refetch.
 *
 * @param tourId - The parent tour identifier.
 * @param tourDateId - The tour date identifier whose images are fetched.
 * @param signal - The TanStack Query abort signal forwarded to `fetch`.
 * @returns The parsed `{ images }` response.
 * @throws If the response status is not OK.
 */
const fetchTourDateImages = async (
  tourId: string,
  tourDateId: string,
  signal?: AbortSignal
): Promise<TourDateImagesResponse> => {
  return fetchAndParse(
    `/api/tours/${encodeURIComponent(tourId)}/dates/${encodeURIComponent(tourDateId)}/images`,
    tourDateImagesResponseSchema,
    { signal, errorMessage: 'Failed to fetch tour date images' }
  );
};

/**
 * React Query hook for fetching a tour date's images.
 *
 * Wraps {@link fetchTourDateImages} with a stable query key and exposes the
 * request state. Cancellation is handled automatically via the forwarded
 * `AbortSignal`. Consumers read the ordered images via `data?.images`.
 *
 * @param tourId - The parent tour identifier.
 * @param tourDateId - The tour date identifier whose images are fetched.
 * @param options - Caller overrides spread into the `useQuery` call (e.g.
 * `enabled`); the non-empty-ids gate is always applied on top.
 * @returns The query state: `isPending`, `error` (defaulted when unknown),
 * `data`, and `refetch`.
 */
export const useTourDateImagesQuery = (
  tourId: string,
  tourDateId: string,
  options: QueryOptionsOverride<TourDateImagesResponse> = {}
) => {
  const {
    isPending,
    error = Error('Unknown error'),
    data,
    refetch,
  } = useQuery({
    queryKey: queryKeys.tours.dateImages(tourId, tourDateId),
    queryFn: ({ signal }) => fetchTourDateImages(tourId, tourDateId, signal),
    ...options,
    enabled: (options.enabled ?? true) && !!tourId && !!tourDateId,
  });

  return { isPending, error, data, refetch };
};
