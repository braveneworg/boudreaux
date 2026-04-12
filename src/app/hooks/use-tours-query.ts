/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { useQuery } from '@tanstack/react-query';

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

const fetchTours = async (): Promise<ToursResponse> => {
  const response = await fetch('/api/tours');
  if (!response.ok) {
    throw Error('Failed to fetch tours');
  }
  return response.json() as Promise<ToursResponse>;
};

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
