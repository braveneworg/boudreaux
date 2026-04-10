/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { useQuery } from '@tanstack/react-query';

import { queryKeys } from '@/lib/query-keys';

const fetchArtists = async () => {
  const response = await fetch('/api/artists');
  if (!response.ok) {
    throw Error('Failed to fetch artists');
  }
  return response.json();
};

export const useArtistsQuery = () => {
  const {
    isPending,
    error = Error('Unknown error'),
    data,
    refetch,
  } = useQuery({
    queryKey: queryKeys.artists.list(),
    queryFn: fetchArtists,
  });

  return { isPending, error, data, refetch };
};
