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

const fetchTour = async (tourId: string): Promise<TourWithRelations | null> => {
  const response = await fetch(`/api/tours/${encodeURIComponent(tourId)}`);
  if (!response.ok) {
    if (response.status === 404) {
      return null;
    }
    throw Error('Failed to fetch tour');
  }
  const data = await response.json();
  return (data.tour ?? data) as TourWithRelations;
};

export const useTourQuery = (tourId: string) => {
  const {
    isPending,
    error = Error('Unknown error'),
    data,
    refetch,
  } = useQuery({
    queryKey: queryKeys.tours.detail(tourId),
    queryFn: () => fetchTour(tourId),
    enabled: !!tourId,
  });

  return { isPending, error, data, refetch };
};
