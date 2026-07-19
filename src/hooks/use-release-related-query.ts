/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { useQuery } from '@tanstack/react-query';
import { z } from 'zod';

import { queryKeys } from '@/lib/query-keys';
import type { ReleaseCarouselItem } from '@/lib/types/media-models';
import { releaseCarouselItemSchema } from '@/lib/validation/media-models-schema';
import { fetchAndParse } from '@/utils/fetch-and-parse';

import type { QueryOptionsOverride } from './query-options';

interface ReleaseRelatedResponse {
  releases: ReleaseCarouselItem[];
}

const releaseRelatedResponseSchema = z.object({
  releases: z.array(releaseCarouselItemSchema),
}) satisfies z.ZodType<ReleaseRelatedResponse>;

/**
 * Fetches related releases from the `/api/releases/{releaseId}/related` route handler.
 *
 * Forwards the TanStack Query {@link AbortSignal} to `fetch` so the request is
 * cancelled automatically on unmount, invalidation, or a superseding refetch.
 *
 * @param releaseId - The ID of the release whose related releases are fetched.
 * @param artistId - Optional artist ID to scope the related releases.
 * @param signal - The TanStack Query abort signal forwarded to `fetch`.
 * @returns The parsed JSON response containing the related releases.
 * @throws If the response status is not OK.
 */
const fetchReleaseRelated = async (
  releaseId: string,
  artistId: string | null,
  signal?: AbortSignal
): Promise<ReleaseRelatedResponse> => {
  const url = artistId
    ? `/api/releases/${encodeURIComponent(releaseId)}/related?artistId=${encodeURIComponent(artistId)}`
    : `/api/releases/${encodeURIComponent(releaseId)}/related`;
  return fetchAndParse(url, releaseRelatedResponseSchema, {
    signal,
    errorMessage: 'Failed to fetch related releases',
  });
};

/**
 * React Query hook for fetching related releases.
 *
 * Wraps {@link fetchReleaseRelated} with a stable query key and exposes the
 * request state. Cancellation is handled automatically via the forwarded
 * `AbortSignal`.
 *
 * @param releaseId - The ID of the release whose related releases are fetched.
 * @param artistId - Optional artist ID to scope the related releases.
 * @param options - Caller overrides spread into the `useQuery` call (e.g.
 * `enabled`); the non-empty-releaseId gate is always applied on top.
 * @returns The query state: `isPending`, `error` (defaulted when unknown),
 * `data`, and `refetch`.
 */
export const useReleaseRelatedQuery = (
  releaseId: string,
  artistId: string | null = null,
  options: QueryOptionsOverride<ReleaseRelatedResponse> = {}
) => {
  const {
    isPending,
    error = Error('Unknown error'),
    data,
    refetch,
  } = useQuery({
    queryKey: queryKeys.releases.related(releaseId, artistId),
    queryFn: ({ signal }) => fetchReleaseRelated(releaseId, artistId, signal),
    ...options,
    enabled: (options.enabled ?? true) && !!releaseId,
  });

  return { isPending, error, data, refetch };
};
