/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { useQuery } from '@tanstack/react-query';

import { queryKeys } from '@/lib/query-keys';

interface PublishedReleasesResponse {
  releases: Array<{
    id: string;
    title: string;
    releasedOn: string;
    catalogNumber: string | null;
    coverArtUrl: string | null;
    published: boolean;
    artists: Array<{
      id: string;
      name: string;
      slug: string;
      firstName: string | null;
      lastName: string | null;
    }>;
    bandcampUrl: string | null;
  }>;
  count: number;
}

const fetchPublishedReleases = async (): Promise<PublishedReleasesResponse> => {
  const response = await fetch('/api/releases?listing=published');
  if (!response.ok) {
    throw Error('Failed to fetch releases');
  }
  return response.json() as Promise<PublishedReleasesResponse>;
};

export const usePublishedReleasesQuery = () => {
  const {
    isPending,
    error = Error('Unknown error'),
    data,
    refetch,
  } = useQuery({
    queryKey: queryKeys.releases.published(),
    queryFn: fetchPublishedReleases,
  });

  return { isPending, error, data, refetch };
};
