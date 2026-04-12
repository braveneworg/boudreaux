/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { useQuery } from '@tanstack/react-query';

import { queryKeys } from '@/lib/query-keys';

interface VenueDetail {
  id: string;
  name: string;
  address: string | null;
  city: string | null;
  state: string | null;
  postalCode: string | null;
  country: string | null;
  timeZone: string | null;
}

const fetchVenueDetail = async (venueId: string): Promise<VenueDetail> => {
  const response = await fetch(`/api/venues/${venueId}`);
  if (!response.ok) {
    throw Error('Failed to fetch venue details');
  }
  return response.json() as Promise<VenueDetail>;
};

export const useVenueDetailQuery = (venueId: string) => {
  const {
    isPending,
    error = Error('Unknown error'),
    data,
    refetch,
  } = useQuery({
    queryKey: queryKeys.venues.detail(venueId),
    queryFn: () => fetchVenueDetail(venueId),
    enabled: !!venueId,
  });

  return { isPending, error, data, refetch };
};
