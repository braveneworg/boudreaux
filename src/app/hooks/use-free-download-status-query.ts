/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
import { useQuery } from '@tanstack/react-query';

import { queryKeys } from '@/lib/query-keys';
import type { FreeStatusResponse } from '@/lib/validation/bundle-download-schema';

/**
 * Fetches a release's free-download status from the
 * `/api/releases/[id]/download/free-status` route handler.
 *
 * Forwards the TanStack Query {@link AbortSignal} to `fetch` so the request is
 * cancelled automatically on unmount, invalidation, or a superseding refetch.
 *
 * @param releaseId - The release whose free-download status is requested.
 * @param signal - The TanStack Query abort signal forwarded to `fetch`.
 * @returns The parsed JSON response containing the free-download status.
 * @throws If the response status is not OK.
 */
const fetchFreeDownloadStatus = async (
  releaseId: string,
  signal?: AbortSignal
): Promise<FreeStatusResponse> => {
  const response = await fetch(
    `/api/releases/${encodeURIComponent(releaseId)}/download/free-status`,
    { signal }
  );
  if (!response.ok) {
    throw Error('Failed to fetch free download status');
  }
  return (await response.json()) as FreeStatusResponse;
};

/**
 * Reads `GET /api/releases/[id]/download/free-status` and caches the result.
 * Used by the download dialog to gate the free radio (per FR-015 — disabled
 * when no free formats are published) and by FreeFormatSelectStep to source
 * `availableFreeFormats`.
 *
 * Wraps {@link fetchFreeDownloadStatus}; cancellation is handled automatically
 * via the forwarded `AbortSignal`.
 *
 * Feature: 007-free-digital-downloads.
 *
 * @param releaseId - The release whose free-download status is requested.
 * @param options - Optional settings; `enabled` defers the request.
 * @returns The `useQuery` result for the free-download status.
 */
export const useFreeDownloadStatusQuery = (releaseId: string, options?: { enabled?: boolean }) => {
  return useQuery({
    queryKey: queryKeys.releases.freeDownloadStatus(releaseId),
    queryFn: ({ signal }) => fetchFreeDownloadStatus(releaseId, signal),
    enabled: (options?.enabled ?? true) && !!releaseId,
    // Status changes after each successful download; cache only briefly.
    staleTime: 30_000,
  });
};
