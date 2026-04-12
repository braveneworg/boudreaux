/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { useQuery } from '@tanstack/react-query';

import { queryKeys } from '@/lib/query-keys';

const fetchFeaturedArtists = async () => {
  const response = await fetch('/api/featured-artists');
  if (!response.ok) {
    throw Error('Failed to fetch featured artists');
  }
  return response.json();
};

export const useFeaturedArtistsQuery = () => {
  const {
    isPending,
    error = Error('Unknown error'),
    data,
    refetch,
  } = useQuery({
    queryKey: queryKeys.featuredArtists.list(),
    queryFn: fetchFeaturedArtists,
    refetchOnMount: 'always', // Always refetch when admin page mounts (e.g., after create/edit)
  });

  return { isPending, error, data, refetch };
};
