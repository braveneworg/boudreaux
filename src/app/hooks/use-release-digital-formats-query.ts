/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { useQuery } from '@tanstack/react-query';

import type { DigitalFormatType } from '@/lib/constants/digital-formats';
import { queryKeys } from '@/lib/query-keys';

interface ReleaseDigitalFormatsResponse {
  formats: Array<{
    formatType: DigitalFormatType;
    fileName: string;
  }>;
}

/**
 * Fetches a release's digital formats from the
 * `/api/releases/{releaseId}/digital-formats` route handler.
 *
 * Forwards the TanStack Query {@link AbortSignal} to `fetch` so the request is
 * cancelled automatically on unmount, invalidation, or a superseding refetch.
 *
 * @param releaseId - The ID of the release whose digital formats are fetched.
 * @param signal - The TanStack Query abort signal forwarded to `fetch`.
 * @returns The parsed JSON response containing the release's digital formats.
 * @throws If the response status is not OK.
 */
const fetchReleaseDigitalFormats = async (
  releaseId: string,
  signal?: AbortSignal
): Promise<ReleaseDigitalFormatsResponse> => {
  const response = await fetch(`/api/releases/${encodeURIComponent(releaseId)}/digital-formats`, {
    signal,
  });
  if (!response.ok) {
    throw Error('Failed to fetch digital formats');
  }
  return response.json() as Promise<ReleaseDigitalFormatsResponse>;
};

/**
 * React Query hook for fetching a release's digital formats.
 *
 * Wraps {@link fetchReleaseDigitalFormats} with a stable query key and exposes
 * the request state. Cancellation is handled automatically via the forwarded
 * `AbortSignal`.
 *
 * @param releaseId - The ID of the release whose digital formats are fetched.
 * @param options - Optional settings, including whether the query is `enabled`.
 * @returns The query state: `isPending`, `error` (defaulted when unknown),
 * `data`, and `refetch`.
 */
export const useReleaseDigitalFormatsQuery = (
  releaseId: string,
  options?: { enabled?: boolean }
) => {
  const {
    isPending,
    error = Error('Unknown error'),
    data,
    refetch,
  } = useQuery({
    queryKey: queryKeys.releases.digitalFormats(releaseId),
    queryFn: ({ signal }) => fetchReleaseDigitalFormats(releaseId, signal),
    enabled: (options?.enabled ?? true) && !!releaseId,
  });

  return { isPending, error, data, refetch };
};
