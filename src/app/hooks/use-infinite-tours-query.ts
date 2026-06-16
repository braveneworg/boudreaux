/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { keepPreviousData, useInfiniteQuery } from '@tanstack/react-query';

import { queryKeys } from '@/lib/query-keys';
import type { PaginatedResponse } from '@/lib/types/pagination';
import { paginatedResponseSchema } from '@/lib/validation/pagination-schema';
import { tourWithRelationsSchema } from '@/lib/validation/tour-models-schema';

import { fetchAndParse } from './fetch-and-parse';

import type { InfiniteQueryOptionsOverride } from './query-options';
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

/** One skip/offset page of tours returned by `/api/tours`. */
export type ToursPaginatedResponse = PaginatedResponse<TourWithRelations>;

/** Page size requested per fetch — kept in sync with the SSR prefetch. */
export const TOURS_PAGE_SIZE = 24;

/** Strict schema for one `/api/tours` page. */
const toursPaginatedResponseSchema = paginatedResponseSchema(tourWithRelationsSchema);

/**
 * Fetches one page of tours from the `/api/tours` route handler.
 *
 * Forwards the TanStack Query {@link AbortSignal} to `fetch` so the request is
 * cancelled automatically on unmount, invalidation, or a superseding refetch.
 *
 * @param search - Server-side search term (empty string fetches all tours).
 * @param skip - Offset of the page to fetch.
 * @param signal - The query's abort signal.
 * @returns The page of tours plus the `nextSkip` cursor.
 * @throws If the response status is not OK.
 */
const fetchTours = async (
  search: string,
  skip: number,
  signal?: AbortSignal
): Promise<ToursPaginatedResponse> => {
  const params = new URLSearchParams({ skip: String(skip), take: String(TOURS_PAGE_SIZE) });
  if (search) params.set('search', search);

  return fetchAndParse(`/api/tours?${params.toString()}`, toursPaginatedResponseSchema, {
    signal,
    errorMessage: 'Failed to fetch tours',
  });
};

/**
 * React Query infinite hook for the public tours listing.
 *
 * Pages through `/api/tours` via skip/offset, accumulating results for infinite
 * scroll. `search` is applied server-side and is part of the query key, so
 * changing it resets pagination. `keepPreviousData` keeps the current results
 * visible during a search transition. Cancellation is automatic via the
 * forwarded `AbortSignal`.
 *
 * @param search - Debounced, server-side search term.
 * @param options - Caller overrides spread into the `useInfiniteQuery` call
 * (e.g. `enabled`, `staleTime`); they take precedence over the defaults below.
 * @returns The TanStack `useInfiniteQuery` result (`data.pages`, `fetchNextPage`, etc.).
 */
export const useInfiniteToursQuery = (
  search: string,
  options: InfiniteQueryOptionsOverride<ToursPaginatedResponse> = {}
) =>
  useInfiniteQuery({
    queryKey: queryKeys.tours.infinite(search),
    queryFn: ({ pageParam, signal }) => fetchTours(search, pageParam, signal),
    initialPageParam: 0,
    getNextPageParam: (lastPage) => lastPage.nextSkip,
    placeholderData: keepPreviousData,
    ...options,
  });
