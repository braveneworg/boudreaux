/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { useQuery } from '@tanstack/react-query';

const fetchReleases = async () => {
  const response = await fetch('/api/releases');
  if (!response.ok) {
    throw Error('Failed to fetch releases');
  }
  return response.json();
};

const useReleasesQuery = () => {
  const {
    isPending,
    error = Error('Unknown error'),
    data,
    refetch,
  } = useQuery({
    queryKey: ['releasesData'],
    queryFn: fetchReleases,
    staleTime: 0, // Always refetch when the query is accessed
  });

  return { isPending, error, data, refetch };
};

export default useReleasesQuery;
