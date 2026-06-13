/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { useQuery, type QueryFunctionContext } from '@tanstack/react-query';

import { queryKeys } from '@/lib/query-keys';

interface DownloadQuotaResponse {
  success: boolean;
  remainingQuota: number;
  downloadedReleaseIds: string[];
}

/**
 * Fetches the viewer's free download quota from the `/api/user/download-quota`
 * route handler.
 *
 * Forwards the TanStack Query {@link AbortSignal} to `fetch` so the request is
 * cancelled automatically on unmount, invalidation, or a superseding refetch.
 *
 * @param context - The TanStack Query function context, providing the `signal`.
 * @returns The parsed JSON response containing the download quota.
 * @throws If the response status is not OK.
 */
const fetchDownloadQuota = async ({
  signal,
}: QueryFunctionContext): Promise<DownloadQuotaResponse> => {
  const response = await fetch('/api/user/download-quota', { signal });
  if (!response.ok) {
    throw Error('Failed to fetch download quota');
  }
  return response.json() as Promise<DownloadQuotaResponse>;
};

/**
 * React Query hook for fetching the viewer's free download quota.
 *
 * Wraps {@link fetchDownloadQuota} with a stable query key and exposes the
 * request state. Cancellation is handled automatically via the forwarded
 * `AbortSignal`.
 *
 * @param enabled - Whether the query should run (defaults to `true`).
 * @returns The query state: `isPending`, `error` (defaulted when unknown),
 * `data`, and `refetch`.
 */
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
