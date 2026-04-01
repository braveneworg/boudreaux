/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { useQuery } from '@tanstack/react-query';

const fetchFeaturedArtists = async () => {
  const response = await fetch('/api/featured-artists');
  if (!response.ok) {
    throw Error('Failed to fetch featured artists');
  }
  return response.json();
};

const useFeaturedArtistsQuery = () => {
  const {
    isPending,
    error = Error('Unknown error'),
    data,
    refetch,
  } = useQuery({
    queryKey: ['featuredArtistsData'],
    queryFn: fetchFeaturedArtists,
    staleTime: 0, // Always refetch when the query is accessed
    refetchOnMount: 'always', // Always refetch when admin page mounts (e.g., after create/edit)
  });

  return { isPending, error, data, refetch };
};

export default useFeaturedArtistsQuery;
