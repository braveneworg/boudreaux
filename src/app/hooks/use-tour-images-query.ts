/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { useQuery } from '@tanstack/react-query';
import { z } from 'zod';

import { queryKeys } from '@/lib/query-keys';
import { tourImageSchema } from '@/lib/validation/tour-models-schema';

import { fetchAndParse } from './fetch-and-parse';

import type { QueryOptionsOverride } from './query-options';

/** Strict schema for the `/api/tours/{tourId}/images` response. */
const tourImagesResponseSchema = z.object({ images: z.array(tourImageSchema) });

/** The parsed `{ images }` response returned by the tour-images route. */
export type TourImagesResponse = z.infer<typeof tourImagesResponseSchema>;

/**
 * Fetches a tour's images from the `/api/tours/{tourId}/images` route handler.
 *
 * The route always responds 200 with `{ images: [] }`, so no 404 special-casing
 * is needed. Forwards the TanStack Query {@link AbortSignal} to `fetch` so the
 * request is cancelled automatically on unmount, invalidation, or a superseding
 * refetch.
 *
 * @param tourId - The tour identifier whose images are fetched.
 * @param signal - The TanStack Query abort signal forwarded to `fetch`.
 * @returns The parsed `{ images }` response.
 * @throws If the response status is not OK.
 */
const fetchTourImages = async (
  tourId: string,
  signal?: AbortSignal
): Promise<TourImagesResponse> => {
  return fetchAndParse(
    `/api/tours/${encodeURIComponent(tourId)}/images`,
    tourImagesResponseSchema,
    { signal, errorMessage: 'Failed to fetch tour images' }
  );
};

/**
 * React Query hook for fetching a tour's images.
 *
 * Wraps {@link fetchTourImages} with a stable query key and exposes the request
 * state. Cancellation is handled automatically via the forwarded `AbortSignal`.
 * Consumers read the ordered images via `data?.images`.
 *
 * @param tourId - The tour identifier whose images are fetched.
 * @param options - Caller overrides spread into the `useQuery` call (e.g.
 * `enabled`); the non-empty-tourId gate is always applied on top.
 * @returns The query state: `isPending`, `error` (defaulted when unknown),
 * `data`, and `refetch`.
 */
export const useTourImagesQuery = (
  tourId: string,
  options: QueryOptionsOverride<TourImagesResponse> = {}
) => {
  const {
    isPending,
    error = Error('Unknown error'),
    data,
    refetch,
  } = useQuery({
    queryKey: queryKeys.tours.images(tourId),
    queryFn: ({ signal }) => fetchTourImages(tourId, signal),
    ...options,
    enabled: (options.enabled ?? true) && !!tourId,
  });

  return { isPending, error, data, refetch };
};
