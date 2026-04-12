/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { useQuery } from '@tanstack/react-query';

import { queryKeys } from '@/lib/query-keys';
import type { HealthStatus } from '@/lib/types/health-status';
import { getApiBaseUrl } from '@/lib/utils/database-utils';

const fetchHealthStatus = async (): Promise<HealthStatus> => {
  const baseUrl = getApiBaseUrl();
  const apiUrl = `${baseUrl}/api/health`;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 5000);

  try {
    const response = await fetch(apiUrl, {
      cache: 'no-store',
      credentials: 'same-origin',
      headers: {
        'Cache-Control': 'no-cache',
        Pragma: 'no-cache',
      },
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      let errorData: Partial<HealthStatus>;
      try {
        errorData = (await response.json()) as Partial<HealthStatus>;
      } catch {
        errorData = { database: 'Failed to parse response', status: 'error' };
      }
      throw Error(errorData.database ?? 'Failed to fetch health status');
    }

    return (await response.json()) as HealthStatus;
  } catch (error) {
    clearTimeout(timeoutId);
    throw error;
  }
};

export const useHealthStatusQuery = () => {
  const {
    isPending,
    error = Error('Unknown error'),
    data,
    refetch,
  } = useQuery({
    queryKey: queryKeys.health.status(),
    queryFn: fetchHealthStatus,
    retry: 10,
    retryDelay: (attemptIndex) => (attemptIndex < 3 ? 500 : Math.pow(2, attemptIndex - 3) * 1000),
    gcTime: 0,
    staleTime: 0,
  });

  return { isPending, error, data, refetch };
};
