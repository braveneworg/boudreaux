/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { useQuery } from '@tanstack/react-query';

import { queryKeys } from '@/lib/query-keys';

interface ArtistNavSearchResult {
  artistSlug: string;
  artistName: string;
  thumbnailSrc: string | null;
  releases: Array<{ id: string; title: string }>;
}

interface ArtistNavSearchResponse {
  results: ArtistNavSearchResult[];
}

const fetchArtistNavSearch = async (query: string): Promise<ArtistNavSearchResponse> => {
  const response = await fetch(`/api/artists/search?q=${encodeURIComponent(query)}`);
  if (!response.ok) {
    throw Error('Failed to search artists');
  }
  return response.json() as Promise<ArtistNavSearchResponse>;
};

export const useArtistNavSearchQuery = (query: string) => {
  const {
    isPending,
    error = Error('Unknown error'),
    data,
    refetch,
  } = useQuery({
    queryKey: queryKeys.artists.search(query),
    queryFn: () => fetchArtistNavSearch(query),
    enabled: query.length >= 3,
  });

  return { isPending, error, data, refetch };
};
