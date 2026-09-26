/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { useQuery } from '@tanstack/react-query';

import type { QueryOptionsOverride } from '@/hooks/query-options';
import { queryKeys } from '@/lib/query-keys';
import {
  imageLinksStatusResponseSchema,
  type ImageLinksStatusResponse,
} from '@/lib/validation/image-links-schema';
import { isInFlightJobStatus } from '@/utils/async-job-lifecycle';
import { fetchAndParse } from '@/utils/fetch-and-parse';

/** Poll cadence while an images-from-links job is pending/processing. */
const POLL_INTERVAL_MS = 2500;

/**
 * Fetches an artist's image-source links and images-from-links job status from
 * `/api/artists/:id/image-links`, forwarding the TanStack `AbortSignal`.
 *
 * @param artistId - The artist whose links/status to read.
 * @param signal - The TanStack Query `AbortSignal` used to cancel the request.
 * @returns The parsed links plus the job's lifecycle view.
 */
const fetchImageLinksStatus = async (
  artistId: string,
  signal?: AbortSignal
): Promise<ImageLinksStatusResponse> =>
  fetchAndParse(
    `/api/artists/${encodeURIComponent(artistId)}/image-links`,
    imageLinksStatusResponseSchema,
    { signal, errorMessage: 'Failed to fetch image links' }
  );

/**
 * Reads an artist's image-source links and polls the images-from-links job.
 * The query refetches on an interval only while the job is in flight
 * (`pending`/`processing`); terminal states and `null` (never run) do not
 * poll. Status data is never considered fresh (`staleTime: 0`), so enabling
 * or invalidating the query fires an immediate fetch.
 *
 * @param artistId - The artist to read; the query is disabled when empty.
 * @param options - Caller overrides spread into `useQuery` (notably `enabled`);
 * the non-empty-id gate and adaptive `refetchInterval` are applied on top.
 * @returns The query state: `isPending`, `error` (defaulted), `data`, `refetch`.
 */
export const useArtistImageLinksQuery = (
  artistId: string,
  options: QueryOptionsOverride<ImageLinksStatusResponse> = {}
) => {
  const {
    isPending,
    error = Error('Unknown error'),
    data,
    refetch,
  } = useQuery({
    queryKey: queryKeys.artists.imageLinks(artistId),
    queryFn: ({ signal }) => fetchImageLinksStatus(artistId, signal),
    staleTime: 0,
    ...options,
    enabled: (options.enabled ?? true) && !!artistId,
    refetchInterval: (query) =>
      isInFlightJobStatus(query.state.data?.status) ? POLL_INTERVAL_MS : false,
  });

  return { isPending, error, data, refetch };
};
