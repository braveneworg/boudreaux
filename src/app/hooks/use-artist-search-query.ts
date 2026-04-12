/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { useQuery } from '@tanstack/react-query';

import { queryKeys } from '@/lib/query-keys';

interface ArtistSearchResponse {
  artists: Array<{
    id: string;
    name: string;
    slug: string;
    imageUrl: string | null;
    firstName: string | null;
    lastName: string | null;
  }>;
}

const fetchArtistSearch = async (query: string): Promise<ArtistSearchResponse> => {
  const response = await fetch(`/api/artists/search?q=${encodeURIComponent(query)}&format=full`);
  if (!response.ok) {
    throw Error('Failed to search artists');
  }
  return response.json() as Promise<ArtistSearchResponse>;
};

export const useArtistSearchQuery = (query: string) => {
  const {
    isPending,
    error = Error('Unknown error'),
    data,
    refetch,
  } = useQuery({
    queryKey: queryKeys.artists.search(query),
    queryFn: () => fetchArtistSearch(query),
    enabled: query.length > 0,
  });

  return { isPending, error, data, refetch };
};
