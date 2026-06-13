/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { useQuery } from '@tanstack/react-query';

import { queryKeys } from '@/lib/query-keys';

/**
 * Fetches a single release from the `/api/releases/{releaseId}` route handler.
 *
 * Forwards the TanStack Query {@link AbortSignal} to `fetch` so the request is
 * cancelled automatically on unmount, invalidation, or a superseding refetch.
 *
 * @param releaseId - The ID of the release to fetch.
 * @param signal - The TanStack Query abort signal forwarded to `fetch`.
 * @returns The parsed JSON response for the release, or `null` if not found.
 * @throws If the response status is not OK and not a 404.
 */
const fetchRelease = async (releaseId: string, signal?: AbortSignal) => {
  const response = await fetch(`/api/releases/${encodeURIComponent(releaseId)}?withTracks=true`, {
    signal,
  });
  if (!response.ok) {
    if (response.status === 404) {
      return null;
    }
    throw Error('Failed to fetch release');
  }
  return response.json();
};

/**
 * React Query hook for fetching a single release.
 *
 * Wraps {@link fetchRelease} with a stable query key and exposes the request
 * state. Cancellation is handled automatically via the forwarded `AbortSignal`.
 *
 * @param releaseId - The ID of the release to fetch.
 * @returns The query state: `isPending`, `error` (defaulted when unknown),
 * `data`, and `refetch`.
 */
export const useReleaseQuery = (releaseId: string) => {
  const {
    isPending,
    error = Error('Unknown error'),
    data,
    refetch,
  } = useQuery({
    queryKey: queryKeys.releases.detail(releaseId),
    queryFn: ({ signal }) => fetchRelease(releaseId, signal),
    enabled: !!releaseId,
  });

  return { isPending, error, data, refetch };
};
