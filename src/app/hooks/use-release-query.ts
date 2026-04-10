/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { useQuery } from '@tanstack/react-query';

import { queryKeys } from '@/lib/query-keys';

const fetchRelease = async (releaseId: string) => {
  const response = await fetch(`/api/releases/${encodeURIComponent(releaseId)}?withTracks=true`);
  if (!response.ok) {
    if (response.status === 404) {
      return null;
    }
    throw Error('Failed to fetch release');
  }
  return response.json();
};

export const useReleaseQuery = (releaseId: string) => {
  const {
    isPending,
    error = Error('Unknown error'),
    data,
    refetch,
  } = useQuery({
    queryKey: queryKeys.releases.detail(releaseId),
    queryFn: () => fetchRelease(releaseId),
    enabled: !!releaseId,
  });

  return { isPending, error, data, refetch };
};
