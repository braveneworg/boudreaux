/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { useQuery } from '@tanstack/react-query';

import type { QueryOptionsOverride } from '@/hooks/query-options';
import { queryKeys } from '@/lib/query-keys';
import {
  bioGenerationStatusResponseSchema,
  type BioGenerationStatusResponse,
} from '@/lib/validation/bio-generation-schema';
import { isInFlightJobStatus } from '@/utils/async-job-lifecycle';
import { fetchAndParse } from '@/utils/fetch-and-parse';

/** Poll cadence while a generation job is pending/processing. */
const POLL_INTERVAL_MS = 2500;

/**
 * Fetches the async bio-generation status for an artist from
 * `/api/artists/:id/bio-generation`, forwarding the TanStack `AbortSignal`.
 *
 * @param artistId - The artist whose generation status to read.
 * @param signal - The TanStack Query `AbortSignal` used to cancel the request.
 * @returns The parsed status (and finished content — with row ids — when succeeded).
 */
const fetchBioGenerationStatus = async (
  artistId: string,
  signal?: AbortSignal
): Promise<BioGenerationStatusResponse> =>
  fetchAndParse(
    `/api/artists/${encodeURIComponent(artistId)}/bio-generation`,
    bioGenerationStatusResponseSchema,
    { signal, errorMessage: 'Failed to fetch bio generation status' }
  );

/**
 * Polls an artist's async bio-generation status. The query refetches on an
 * interval only while the job is in flight (`pending`/`processing`); terminal
 * states (`succeeded`/`failed`) and `null` (never generated) do not poll.
 * Callers that trigger generation get fresh polling for free: the action sets
 * `pending` server-side, and because the query defaults to `staleTime: 0`
 * (poll-status data is never considered fresh), enabling it fires an immediate
 * fetch — the in-flight status then resumes the 2.5s interval.
 *
 * @param artistId - The artist to poll; the query is disabled when empty.
 * @param options - Caller overrides spread into `useQuery` (notably `enabled`);
 * the non-empty-id gate and adaptive `refetchInterval` are applied on top.
 * @returns The query state: `isPending`, `error` (defaulted), `data`, `refetch`.
 */
export const useArtistBioGenerationStatusQuery = (
  artistId: string,
  options: QueryOptionsOverride<BioGenerationStatusResponse> = {}
) => {
  const {
    isPending,
    error = Error('Unknown error'),
    data,
    refetch,
  } = useQuery({
    queryKey: queryKeys.artists.bioGeneration(artistId),
    queryFn: ({ signal }) => fetchBioGenerationStatus(artistId, signal),
    staleTime: 0,
    ...options,
    enabled: (options.enabled ?? true) && !!artistId,
    refetchInterval: (query) =>
      isInFlightJobStatus(query.state.data?.status) ? POLL_INTERVAL_MS : false,
  });

  return { isPending, error, data, refetch };
};
