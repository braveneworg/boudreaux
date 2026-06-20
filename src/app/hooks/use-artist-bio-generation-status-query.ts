/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { useQuery } from '@tanstack/react-query';

import { queryKeys } from '@/lib/query-keys';
import {
  bioGenerationStatusResponseSchema,
  isTerminalBioStatus,
  type BioGenerationStatusResult,
} from '@/lib/validation/bio-generation-schema';

import { parseResponse } from './fetch-and-parse';

import type { QueryOptionsOverride } from './query-options';

/** Poll cadence while a generation job is pending/processing. */
const POLL_INTERVAL_MS = 2500;

/**
 * Fetches the async bio-generation status for an artist from
 * `/api/artists/:id/bio-generation`, forwarding the TanStack `AbortSignal`.
 *
 * @param artistId - The artist whose generation status to read.
 * @param signal - The TanStack Query `AbortSignal` used to cancel the request.
 * @returns The parsed status (and finished content when succeeded).
 */
const fetchBioGenerationStatus = async (
  artistId: string,
  signal?: AbortSignal
): Promise<BioGenerationStatusResult> => {
  const url = `/api/artists/${encodeURIComponent(artistId)}/bio-generation`;
  const response = await fetch(url, { signal });
  if (!response.ok) {
    throw Error('Failed to fetch bio generation status');
  }
  return parseResponse(url, bioGenerationStatusResponseSchema, await response.json());
};

/**
 * Polls an artist's async bio-generation status. While the job is
 * pending/processing the query refetches on an interval; once it reaches a
 * terminal state (`succeeded`/`failed`) polling stops. Disabled by default —
 * callers enable it after triggering generation (and may keep it enabled to show
 * the last known status).
 *
 * @param artistId - The artist to poll; the query is disabled when empty.
 * @param options - Caller overrides spread into `useQuery` (notably `enabled`);
 * the non-empty-id gate and adaptive `refetchInterval` are applied on top.
 * @returns The query state: `isPending`, `error` (defaulted), `data`, `refetch`.
 */
export const useArtistBioGenerationStatusQuery = (
  artistId: string,
  options: QueryOptionsOverride<BioGenerationStatusResult> = {}
) => {
  const {
    isPending,
    error = Error('Unknown error'),
    data,
    refetch,
  } = useQuery({
    queryKey: queryKeys.artists.bioGeneration(artistId),
    queryFn: ({ signal }) => fetchBioGenerationStatus(artistId, signal),
    ...options,
    enabled: (options.enabled ?? true) && !!artistId,
    refetchInterval: (query) =>
      isTerminalBioStatus(query.state.data?.status) ? false : POLL_INTERVAL_MS,
  });

  return { isPending, error, data, refetch };
};
