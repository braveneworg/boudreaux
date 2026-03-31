/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { useQuery } from '@tanstack/react-query';

const fetchArtists = async () => {
  const response = await fetch('/api/artists');
  if (!response.ok) {
    throw Error('Failed to fetch artists');
  }
  return response.json();
};

const useArtistsQuery = () => {
  const {
    isPending,
    error = Error('Unknown error'),
    data,
    refetch,
  } = useQuery({
    queryKey: ['artistsData'],
    queryFn: fetchArtists,
    staleTime: 0, // Always refetch when the query is accessed
  });

  return { isPending, error, data, refetch };
};

export default useArtistsQuery;
