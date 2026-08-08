/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { useQuery } from '@tanstack/react-query';
import { z } from 'zod';

import type { QueryOptionsOverride } from '@/hooks/query-options';
import { queryKeys } from '@/lib/query-keys';
import { fetchAndParse } from '@/utils/fetch-and-parse';

const lookupResultSchema = z.object({
  description: z.string(),
  confidence: z.enum(['high', 'medium', 'low']),
  sources: z.array(z.string()),
});
const responseSchema = z.object({ result: lookupResultSchema.nullable() });
type VideoDescriptionLookup = z.infer<typeof lookupResultSchema>;

const fetchLookup = async (
  title: string,
  artist: string,
  releasedOn?: string,
  signal?: AbortSignal
): Promise<VideoDescriptionLookup | null> => {
  const params = new URLSearchParams({ title, artist });
  if (releasedOn) params.set('releasedOn', releasedOn);
  const { result } = await fetchAndParse(
    `/api/videos/description-lookup?${params.toString()}`,
    responseSchema,
    { signal, errorMessage: 'Failed to generate the description' }
  );
  return result;
};

/**
 * On-demand web synthesis of a ~500-character video description (artist
 * named, attributed press quotes when the web offers them). Disabled by
 * default — call `refetch()` from the "Generate description" button. Returns
 * the parsed result or null; forwards the AbortSignal.
 *
 * @param title - The video title to describe.
 * @param artist - The artist the prose must name.
 * @param releasedOn - Optional release date (YYYY-MM-DD) for the prose to cite.
 * @param options - Caller overrides spread last into `useQuery`.
 * @returns `{ isFetching, error, data, refetch }`.
 */
export const useVideoDescriptionLookupQuery = (
  title: string,
  artist: string,
  releasedOn?: string,
  options: QueryOptionsOverride<VideoDescriptionLookup | null> = {}
) => {
  const {
    isFetching,
    error = Error('Unknown error'),
    data,
    refetch,
  } = useQuery({
    queryKey: queryKeys.videos.descriptionLookup(title, artist, releasedOn),
    queryFn: ({ signal }) => fetchLookup(title, artist, releasedOn, signal),
    enabled: false,
    retry: false,
    ...options,
  });
  return { isFetching, error, data, refetch };
};
