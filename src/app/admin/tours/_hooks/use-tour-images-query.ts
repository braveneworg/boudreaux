/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { useQuery } from '@tanstack/react-query';
import { z } from 'zod';

import type { QueryOptionsOverride } from '@/hooks/query-options';
import { queryKeys } from '@/lib/query-keys';
import { tourDateImageSchema, tourImageSchema } from '@/lib/validation/tour-models-schema';
import { fetchAndParse } from '@/utils/fetch-and-parse';

/** Whose images to read: a Tour's, or one of its tour dates'. */
export type TourImagesOwner =
  { kind: 'tour'; tourId: string } | { kind: 'tourDate'; tourId: string; tourDateId: string };

/**
 * The parsed `{ images }` response of either images route. Each owner kind's
 * rows are parsed strictly by that model's schema; the screens read only the
 * fields the two have in common.
 */
export interface TourImagesResponse {
  images: Array<z.infer<typeof tourImageSchema> | z.infer<typeof tourDateImageSchema>>;
}

const tourImagesResponseSchema = z.object({ images: z.array(tourImageSchema) });
const tourDateImagesResponseSchema = z.object({ images: z.array(tourDateImageSchema) });

/** The query key the owner's images are cached under. */
const imagesKeyOf = (owner: TourImagesOwner): readonly unknown[] =>
  owner.kind === 'tour'
    ? queryKeys.tours.images(owner.tourId)
    : queryKeys.tours.dateImages(owner.tourId, owner.tourDateId);

/** The ids the owner's route needs; the query waits until none is empty. */
const idsOf = (owner: TourImagesOwner): string[] =>
  owner.kind === 'tour' ? [owner.tourId] : [owner.tourId, owner.tourDateId];

/**
 * Fetches the owner's images from its images route, parsing each owner kind's
 * rows with that model's schema.
 *
 * @throws If the response status is not OK.
 */
const fetchOwnerImages = (
  owner: TourImagesOwner,
  signal?: AbortSignal
): Promise<TourImagesResponse> => {
  const tourPath = `/api/tours/${encodeURIComponent(owner.tourId)}`;
  return owner.kind === 'tour'
    ? fetchAndParse(`${tourPath}/images`, tourImagesResponseSchema, {
        signal,
        errorMessage: 'Failed to fetch tour images',
      })
    : fetchAndParse(
        `${tourPath}/dates/${encodeURIComponent(owner.tourDateId)}/images`,
        tourDateImagesResponseSchema,
        { signal, errorMessage: 'Failed to fetch tour date images' }
      );
};

/**
 * React Query hook for the images of a Tour or of a tour date, for the admin
 * edit screens.
 *
 * Reads the owner's admin-only images route (`/api/tours/{tourId}/images` or
 * `/api/tours/{tourId}/dates/{tourDateId}/images`), which answers an admin
 * 200 with `{ images: [] }` when there are none, so no 404 special-casing is
 * needed. Forwards the TanStack Query {@link AbortSignal} to `fetch` so the
 * request is cancelled on unmount, invalidation, or a superseding refetch.
 *
 * @param owner - The tour, or the tour date and its tour, whose images are read.
 * @param options - Caller overrides spread into the `useQuery` call (e.g.
 * `enabled`); the query also stays disabled while any id it needs is empty.
 * @returns The query state: `isPending`, `error` (defaulted when unknown),
 * `data` (the ordered images as `data?.images`), and `refetch`.
 */
export const useTourImagesQuery = (
  owner: TourImagesOwner,
  options: QueryOptionsOverride<TourImagesResponse> = {}
) => {
  const {
    isPending,
    error = Error('Unknown error'),
    data,
    refetch,
  } = useQuery({
    queryKey: imagesKeyOf(owner),
    queryFn: ({ signal }) => fetchOwnerImages(owner, signal),
    ...options,
    enabled: (options.enabled ?? true) && idsOf(owner).every(Boolean),
  });

  return { isPending, error, data, refetch };
};
