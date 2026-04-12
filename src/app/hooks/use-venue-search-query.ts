/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { useQuery } from '@tanstack/react-query';

import { queryKeys } from '@/lib/query-keys';

interface VenueSearchItem {
  id: string;
  name: string;
  city: string | null;
  state: string | null;
  timeZone: string | null;
}

const fetchVenueSearch = async (search: string): Promise<VenueSearchItem[]> => {
  const params = new URLSearchParams();
  if (search) params.set('search', search);

  const queryString = params.toString();
  const url = `/api/venues${queryString ? `?${queryString}` : ''}`;

  const response = await fetch(url);
  if (!response.ok) {
    throw Error('Failed to fetch venues');
  }
  const json = (await response.json()) as { venues: VenueSearchItem[] };
  return json.venues;
};

export const useVenueSearchQuery = (search: string, enabled = true) => {
  const {
    isPending,
    error = Error('Unknown error'),
    data,
    refetch,
  } = useQuery({
    queryKey: queryKeys.venues.search(search),
    queryFn: () => fetchVenueSearch(search),
    enabled,
  });

  return { isPending, error, data, refetch };
};
