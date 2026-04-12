/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { useQuery } from '@tanstack/react-query';

import { queryKeys } from '@/lib/query-keys';

interface CDNStatus {
  status: 'invalidating' | 'ready' | 'unknown' | 'error';
  message: string;
  estimatedMinutesRemaining?: number;
  inProgress?: number;
  startedAt?: string;
  completedAt?: string;
}

const fetchCdnStatus = async (): Promise<CDNStatus> => {
  const response = await fetch('/api/cdn-status', { cache: 'no-store' });
  if (!response.ok) {
    throw Error('Failed to fetch CDN status');
  }
  return response.json() as Promise<CDNStatus>;
};

export const useCdnStatusQuery = () => {
  const {
    isPending,
    error = Error('Unknown error'),
    data,
    refetch,
  } = useQuery({
    queryKey: queryKeys.cdn.status(),
    queryFn: fetchCdnStatus,
    refetchInterval: (query) => (query.state.data?.status === 'invalidating' ? 30_000 : false),
  });

  return { isPending, error, data, refetch };
};
