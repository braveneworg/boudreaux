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

/**
 * Fetches download analytics for a release from the
 * `/api/releases/[id]/download-analytics` route handler.
 *
 * Forwards the TanStack Query {@link AbortSignal} to `fetch` so the request is
 * cancelled automatically on unmount, invalidation, or a superseding refetch.
 *
 * @param releaseId - The release whose analytics are requested.
 * @param dateRange - The date-range selector (e.g. `'7'`, `'30'`, `'all'`).
 * @param signal - The TanStack Query abort signal forwarded to `fetch`.
 * @returns The parsed JSON response containing the download analytics.
 * @throws If the response status is not OK.
 */
const fetchDownloadAnalytics = async (
  releaseId: string,
  dateRange: string,
  signal?: AbortSignal
): Promise<DownloadAnalyticsResponse> => {
  const params = new URLSearchParams();
  const range = getDateRange(dateRange);
  if (range.startDate) params.set('startDate', range.startDate);
  if (range.endDate) params.set('endDate', range.endDate);

  const queryString = params.toString();
  const url = `/api/releases/${releaseId}/download-analytics${queryString ? `?${queryString}` : ''}`;

  const response = await fetch(url, { signal });
  if (!response.ok) {
    throw Error('Failed to fetch download analytics');
  }
  return response.json() as Promise<DownloadAnalyticsResponse>;
};

/**
 * React Query hook for fetching download analytics for a release.
 *
 * Wraps {@link fetchDownloadAnalytics} with a stable query key and exposes the
 * request state. Cancellation is handled automatically via the forwarded
 * `AbortSignal`.
 *
 * @param releaseId - The release whose analytics are requested.
 * @param dateRange - The date-range selector (e.g. `'7'`, `'30'`, `'all'`).
 * @returns The query state: `isPending`, `error` (defaulted when unknown),
 * `data`, and `refetch`.
 */
export const useDownloadAnalyticsQuery = (releaseId: string, dateRange: string) => {
  const {
    isPending,
    error = Error('Unknown error'),
    data,
    refetch,
  } = useQuery({
    queryKey: queryKeys.downloadAnalytics.byRelease(releaseId, dateRange),
    queryFn: ({ signal }) => fetchDownloadAnalytics(releaseId, dateRange, signal),
    enabled: !!releaseId,
  });

  return { isPending, error, data, refetch };
};
