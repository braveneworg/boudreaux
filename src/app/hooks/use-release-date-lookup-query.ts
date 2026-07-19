/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { useQuery } from '@tanstack/react-query';
import { z } from 'zod';

import { queryKeys } from '@/lib/query-keys';
import { fetchAndParse } from '@/utils/fetch-and-parse';

import type { QueryOptionsOverride } from './query-options';

const lookupResultSchema = z.object({
  releasedOn: z.string(),
  confidence: z.enum(['high', 'medium', 'low']),
  sources: z.array(z.string()),
});
const responseSchema = z.object({ result: lookupResultSchema.nullable() });
type ReleaseDateLookup = z.infer<typeof lookupResultSchema>;

const fetchLookup = async (
  title: string,
  artist: string,
  signal?: AbortSignal
): Promise<ReleaseDateLookup | null> => {
  const params = new URLSearchParams({ title });
  if (artist) params.set('artist', artist);
  const { result } = await fetchAndParse(
    `/api/videos/release-date-lookup?${params.toString()}`,
    responseSchema,
    { signal, errorMessage: 'Failed to look up the release date' }
  );
  return result;
};

/**
 * On-demand web lookup of a video's release date. Disabled by default — call
 * `refetch()` from the "Find release date" button. Returns the parsed result
 * or null; forwards the AbortSignal.
 *
 * @param title - The video title to look up.
 * @param artist - The artist name (optional; only set when non-empty).
 * @param options - Caller overrides spread last into `useQuery`.
 * @returns `{ isFetching, error, data, refetch }`.
 */
export const useReleaseDateLookupQuery = (
  title: string,
  artist: string,
  options: QueryOptionsOverride<ReleaseDateLookup | null> = {}
) => {
  const {
    isFetching,
    error = Error('Unknown error'),
    data,
    refetch,
  } = useQuery({
    queryKey: queryKeys.videos.releaseDateLookup(title, artist),
    queryFn: ({ signal }) => fetchLookup(title, artist, signal),
    enabled: false,
    retry: false,
    ...options,
  });
  return { isFetching, error, data, refetch };
};
