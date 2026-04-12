/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { useQuery } from '@tanstack/react-query';

import { queryKeys } from '@/lib/query-keys';

interface ArtistListItem {
  id: string;
  firstName: string | null;
  lastName: string | null;
  artistName: string | null;
  groupName: string | null;
  slug: string;
  imageUrl: string | null;
}

interface ArtistListParams {
  search?: string;
  take?: number;
}

const fetchArtistList = async (params: ArtistListParams): Promise<ArtistListItem[]> => {
  const searchParams = new URLSearchParams();
  if (params.search) searchParams.set('search', params.search);
  if (params.take !== undefined) searchParams.set('take', String(params.take));

  const queryString = searchParams.toString();
  const url = `/api/artists${queryString ? `?${queryString}` : ''}`;

  const response = await fetch(url);
  if (!response.ok) {
    throw Error('Failed to fetch artists');
  }
  return response.json() as Promise<ArtistListItem[]>;
};

export const useArtistListQuery = (params: ArtistListParams, enabled = true) => {
  const {
    isPending,
    error = Error('Unknown error'),
    data,
    refetch,
  } = useQuery({
    queryKey: queryKeys.artists.filteredList(params),
    queryFn: () => fetchArtistList(params),
    enabled,
  });

  return { isPending, error, data, refetch };
};
