/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { useQuery } from '@tanstack/react-query';

import { queryKeys } from '@/lib/query-keys';
import type { FeaturedArtist } from '@/lib/types/media-models';

interface ActiveFeaturedArtistsResponse {
  featuredArtists: FeaturedArtist[];
  count: number;
}

const fetchActiveFeaturedArtists = async (): Promise<ActiveFeaturedArtistsResponse> => {
  const response = await fetch('/api/featured-artists?active=true&limit=7');
  if (!response.ok) {
    throw Error('Failed to fetch featured artists');
  }
  return response.json() as Promise<ActiveFeaturedArtistsResponse>;
};

export const useActiveFeaturedArtistsQuery = () => {
  const {
    isPending,
    error = Error('Unknown error'),
    data,
    refetch,
  } = useQuery({
    queryKey: queryKeys.featuredArtists.active(),
    queryFn: fetchActiveFeaturedArtists,
  });

  return { isPending, error, data, refetch };
};
