/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { useQuery } from '@tanstack/react-query';

import { queryKeys } from '@/lib/query-keys';

export interface TourDatesResponse {
  tourDates: Array<Record<string, unknown>>;
}

const fetchTourDates = async (tourId: string): Promise<TourDatesResponse> => {
  const response = await fetch(`/api/tours/${tourId}/dates`, { cache: 'no-store' });
  if (!response.ok) {
    throw Error('Failed to fetch tour dates');
  }
  return response.json() as Promise<TourDatesResponse>;
};

export const useTourDatesQuery = (tourId: string) => {
  const {
    isPending,
    error = Error('Unknown error'),
    data,
    refetch,
  } = useQuery({
    queryKey: queryKeys.tours.dates(tourId),
    queryFn: () => fetchTourDates(tourId),
    enabled: !!tourId,
  });

  return { isPending, error, data, refetch };
};
