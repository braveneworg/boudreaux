/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
import { useQuery } from '@tanstack/react-query';

import { queryKeys } from '@/lib/query-keys';
import {
  FreeStatusResponseSchema,
  type FreeStatusResponse,
} from '@/lib/validation/bundle-download-schema';

import { fetchAndParse } from './fetch-and-parse';

import type { QueryOptionsOverride } from './query-options';

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
  const url = `/api/releases/${encodeURIComponent(releaseId)}/download/free-status`;
  return fetchAndParse(url, FreeStatusResponseSchema, {
    signal,
    errorMessage: 'Failed to fetch free download status',
  });
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
 * @param options - Caller overrides spread into the `useQuery` call (e.g.
 * `enabled`); the non-empty-releaseId gate is always applied on top.
 * @returns The `useQuery` result for the free-download status.
 */
export const useFreeDownloadStatusQuery = (
  releaseId: string,
  options: QueryOptionsOverride<FreeStatusResponse> = {}
) =>
  useQuery({
    queryKey: queryKeys.releases.freeDownloadStatus(releaseId),
    queryFn: ({ signal }) => fetchFreeDownloadStatus(releaseId, signal),
    // Status changes after each successful download; cache only briefly.
    staleTime: 30_000,
    ...options,
    enabled: (options.enabled ?? true) && !!releaseId,
  });
