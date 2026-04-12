/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { useQuery } from '@tanstack/react-query';

import { queryKeys } from '@/lib/query-keys';

interface DownloadQuotaResponse {
  success: boolean;
  remainingQuota: number;
  downloadedReleaseIds: string[];
}

const fetchDownloadQuota = async (): Promise<DownloadQuotaResponse> => {
  const response = await fetch('/api/user/download-quota');
  if (!response.ok) {
    throw Error('Failed to fetch download quota');
  }
  return response.json() as Promise<DownloadQuotaResponse>;
};

export const useDownloadQuotaQuery = (enabled = true) => {
  const {
    isPending,
    error = Error('Unknown error'),
    data,
    refetch,
  } = useQuery({
    queryKey: queryKeys.downloadQuota.user(),
    queryFn: fetchDownloadQuota,
    enabled,
  });

  return { isPending, error, data, refetch };
};
