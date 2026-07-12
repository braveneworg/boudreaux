/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { useQuery } from '@tanstack/react-query';

import { queryKeys } from '@/lib/query-keys';
import {
  isInFlightEnrichmentStatus,
  videoEnrichmentStatusResponseSchema,
  type VideoEnrichmentStatusResult,
} from '@/lib/validation/video-enrichment-schema';

import { parseResponse } from './fetch-and-parse';

import type { QueryOptionsOverride } from './query-options';

/** Poll cadence while an enrichment job is pending/processing. */
const POLL_INTERVAL_MS = 2500;

/**
 * Fetches the async enrichment status for a video from
 * `/api/videos/:id/enrichment`, forwarding the TanStack `AbortSignal`.
 *
 * @param videoId - The video whose enrichment status to read.
 * @param signal - The TanStack Query `AbortSignal` used to cancel the request.
 * @returns The parsed status, job state, artists, and suggestions.
 */
const fetchVideoEnrichmentStatus = async (
  videoId: string,
  signal?: AbortSignal
): Promise<VideoEnrichmentStatusResult> => {
  const url = `/api/videos/${encodeURIComponent(videoId)}/enrichment`;
  const response = await fetch(url, { signal });
  if (!response.ok) {
    throw Error('Failed to fetch video enrichment status');
  }
  return parseResponse(url, videoEnrichmentStatusResponseSchema, await response.json());
};

/**
 * Polls a video's async web-enrichment status. The query refetches on an
 * interval only while the job is in flight (`pending`/`processing`); terminal
 * states (`succeeded`/`failed`) and `null` (never enriched) do not poll.
 * Because the query defaults to `staleTime: 0` (poll-status data is never
 * considered fresh), mounting the edit page right after triggering enrichment
 * fires an immediate fetch — the server-set `pending` status then resumes the
 * 2.5s interval with no client trigger.
 *
 * @param videoId - The video to poll; the query is disabled when empty.
 * @param options - Caller overrides spread into `useQuery` (notably `enabled`);
 * the non-empty-id gate and adaptive `refetchInterval` are applied on top.
 * @returns The query state: `isPending`, `error` (defaulted), `data`, `refetch`.
 */
export const useVideoEnrichmentStatusQuery = (
  videoId: string,
  options: QueryOptionsOverride<VideoEnrichmentStatusResult> = {}
) => {
  const {
    isPending,
    error = Error('Unknown error'),
    data,
    refetch,
  } = useQuery({
    queryKey: queryKeys.videos.enrichment(videoId),
    queryFn: ({ signal }) => fetchVideoEnrichmentStatus(videoId, signal),
    staleTime: 0,
    ...options,
    enabled: (options.enabled ?? true) && !!videoId,
    refetchInterval: (query) =>
      isInFlightEnrichmentStatus(query.state.data?.status) ? POLL_INTERVAL_MS : false,
  });

  return { isPending, error, data, refetch };
};
