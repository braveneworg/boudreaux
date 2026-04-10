/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { useQuery } from '@tanstack/react-query';

import { queryKeys } from '@/lib/query-keys';

const fetchReleases = async () => {
  const response = await fetch('/api/releases');
  if (!response.ok) {
    throw Error('Failed to fetch releases');
  }
  return response.json();
};

export const useReleasesQuery = () => {
  const {
    isPending,
    error = Error('Unknown error'),
    data,
    refetch,
  } = useQuery({
    queryKey: queryKeys.releases.list(),
    queryFn: fetchReleases,
  });

  return { isPending, error, data, refetch };
};
