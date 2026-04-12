/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { useQuery } from '@tanstack/react-query';

import { queryKeys } from '@/lib/query-keys';

interface ReleaseListItem {
  id: string;
  title: string;
  slug: string | null;
  artworkUrl: string | null;
}

interface ReleaseListParams {
  search?: string;
  artistIds?: string[];
  take?: number;
}

const fetchReleaseList = async (params: ReleaseListParams): Promise<ReleaseListItem[]> => {
  const searchParams = new URLSearchParams();
  if (params.search) searchParams.set('search', params.search);
  if (params.take !== undefined) searchParams.set('take', String(params.take));
  if (params.artistIds) {
    for (const id of params.artistIds) {
      searchParams.append('artistIds', id);
    }
  }

  const queryString = searchParams.toString();
  const url = `/api/releases${queryString ? `?${queryString}` : ''}`;

  const response = await fetch(url);
  if (!response.ok) {
    throw Error('Failed to fetch releases');
  }
  return response.json() as Promise<ReleaseListItem[]>;
};

export const useReleaseListQuery = (params: ReleaseListParams, enabled = true) => {
  const {
    isPending,
    error = Error('Unknown error'),
    data,
    refetch,
  } = useQuery({
    queryKey: queryKeys.releases.filteredList(params),
    queryFn: () => fetchReleaseList(params),
    enabled,
  });

  return { isPending, error, data, refetch };
};
