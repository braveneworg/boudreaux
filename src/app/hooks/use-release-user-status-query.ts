/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { useQuery } from '@tanstack/react-query';
import { useSession } from 'next-auth/react';

import type { DigitalFormatType } from '@/lib/constants/digital-formats';
import { queryKeys } from '@/lib/query-keys';

interface ReleaseUserStatusResponse {
  hasPurchase: boolean;
  purchasedAt: string | null;
  downloadCount: number;
  resetInHours: number | null;
  availableFormats: Array<{
    formatType: DigitalFormatType;
    fileName: string;
  }>;
}

/**
 * Fetches the current user's status for a release from the
 * `/api/releases/[releaseId]/user-status` route handler.
 *
 * Forwards the TanStack Query {@link AbortSignal} to `fetch` so the request is
 * cancelled automatically on unmount, invalidation, or a superseding refetch.
 *
 * @param releaseId - The release identifier to look up status for.
 * @param signal - The `AbortSignal` forwarded from TanStack Query.
 * @returns The parsed user-status response, or `null` when unauthenticated (401).
 * @throws If the response status is not OK (other than 401).
 */
const fetchReleaseUserStatus = async (
  releaseId: string,
  signal?: AbortSignal
): Promise<ReleaseUserStatusResponse | null> => {
  const response = await fetch(`/api/releases/${encodeURIComponent(releaseId)}/user-status`, {
    signal,
  });
  if (response.status === 401) {
    return null;
  }
  if (!response.ok) {
    throw Error('Failed to fetch release user status');
  }
  return response.json() as Promise<ReleaseUserStatusResponse>;
};

/**
 * React Query hook for fetching the current user's status for a release.
 *
 * Wraps {@link fetchReleaseUserStatus} with a stable query key and exposes the
 * request state. Cancellation is handled automatically via the forwarded
 * `AbortSignal`.
 *
 * @param releaseId - The release identifier to look up status for.
 * @returns The query state: `isPending`, `error` (defaulted when unknown),
 * `data`, and `refetch`.
 */
export const useReleaseUserStatusQuery = (releaseId: string) => {
  const { status } = useSession();

  const {
    isPending,
    error = Error('Unknown error'),
    data,
    refetch,
  } = useQuery({
    queryKey: queryKeys.releases.userStatus(releaseId),
    queryFn: ({ signal }) => fetchReleaseUserStatus(releaseId, signal),
    enabled: !!releaseId && status === 'authenticated',
  });

  return { isPending, error, data, refetch };
};
