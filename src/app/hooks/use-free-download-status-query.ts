/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
import { useQuery } from '@tanstack/react-query';

import { queryKeys } from '@/lib/query-keys';
import type { FreeStatusResponse } from '@/lib/validation/bundle-download-schema';

const fetchFreeDownloadStatus = async (releaseId: string): Promise<FreeStatusResponse> => {
  const response = await fetch(
    `/api/releases/${encodeURIComponent(releaseId)}/download/free-status`
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
 * Feature: 007-free-digital-downloads.
 */
export const useFreeDownloadStatusQuery = (releaseId: string, options?: { enabled?: boolean }) => {
  return useQuery({
    queryKey: queryKeys.releases.freeDownloadStatus(releaseId),
    queryFn: () => fetchFreeDownloadStatus(releaseId),
    enabled: (options?.enabled ?? true) && !!releaseId,
    // Status changes after each successful download; cache only briefly.
    staleTime: 30_000,
  });
};
