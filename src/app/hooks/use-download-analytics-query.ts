/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { useQuery } from '@tanstack/react-query';

import { queryKeys } from '@/lib/query-keys';

interface FormatBreakdown {
  formatType: string;
  count: number;
}

interface DownloadAnalyticsResponse {
  totalDownloads: number;
  uniqueUsers: number;
  formatBreakdown: FormatBreakdown[];
}

function getDateRange(range: string): { startDate?: string; endDate?: string } {
  if (range === 'all') return {};
  const days = parseInt(range);
  const endDate = new Date();
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);
  return {
    startDate: startDate.toISOString(),
    endDate: endDate.toISOString(),
  };
}

const fetchDownloadAnalytics = async (
  releaseId: string,
  dateRange: string
): Promise<DownloadAnalyticsResponse> => {
  const params = new URLSearchParams();
  const range = getDateRange(dateRange);
  if (range.startDate) params.set('startDate', range.startDate);
  if (range.endDate) params.set('endDate', range.endDate);

  const queryString = params.toString();
  const url = `/api/releases/${releaseId}/download-analytics${queryString ? `?${queryString}` : ''}`;

  const response = await fetch(url);
  if (!response.ok) {
    throw Error('Failed to fetch download analytics');
  }
  return response.json() as Promise<DownloadAnalyticsResponse>;
};

export const useDownloadAnalyticsQuery = (releaseId: string, dateRange: string) => {
  const {
    isPending,
    error = Error('Unknown error'),
    data,
    refetch,
  } = useQuery({
    queryKey: queryKeys.downloadAnalytics.byRelease(releaseId, dateRange),
    queryFn: () => fetchDownloadAnalytics(releaseId, dateRange),
    enabled: !!releaseId,
  });

  return { isPending, error, data, refetch };
};
