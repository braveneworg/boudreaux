/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { useQuery } from '@tanstack/react-query';

import { queryKeys } from '@/lib/query-keys';
import { videoRowSchema, type VideoRow } from '@/lib/validation/video-schema';

import { parseResponse } from './fetch-and-parse';

import type { QueryOptionsOverride } from './query-options';

/**
 * Fetches a single video by id from the admin-only `/api/videos/[id]` route
 * handler, validating the body against `videoRowSchema`.
 *
 * Maps a 404 to `null`; forwards the TanStack Query {@link AbortSignal} to
 * `fetch` so the request is cancelled automatically on unmount, invalidation,
 * or a superseding refetch.
 *
 * @param id - The video identifier to fetch.
 * @param signal - The `AbortSignal` forwarded from TanStack Query.
 * @returns The parsed video, or `null` when not found (404).
 * @throws If the response status is not OK (other than 404).
 */
const fetchVideoById = async (id: string, signal?: AbortSignal): Promise<VideoRow | null> => {
  const url = `/api/videos/${encodeURIComponent(id)}`;
  const response = await fetch(url, { signal });
  if (!response.ok) {
    if (response.status === 404) {
      return null;
    }
    throw Error('Failed to fetch video');
  }
  return parseResponse(url, videoRowSchema, await response.json());
};

/**
 * React Query hook for fetching a single video for the admin edit form.
 *
 * Cancellation is handled automatically via the forwarded `AbortSignal`.
 *
 * @param id - The ID of the video to fetch; the query is disabled when empty.
 * @param options - Caller overrides spread into the `useQuery` call (e.g.
 * `enabled`); the non-empty-id gate is always applied on top.
 * @returns The query state: `isPending`, `isError`, `error` (defaulted when
 * unknown), `data`, and `refetch`.
 */
export const useVideoQuery = (id: string, options: QueryOptionsOverride<VideoRow | null> = {}) => {
  const {
    isPending,
    isError,
    error = Error('Unknown error'),
    data,
    refetch,
  } = useQuery({
    queryKey: queryKeys.videos.detail(id),
    queryFn: ({ signal }) => fetchVideoById(id, signal),
    ...options,
    enabled: (options.enabled ?? true) && !!id,
  });

  return { isPending, isError, error, data, refetch };
};
