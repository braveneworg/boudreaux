/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { useQuery } from '@tanstack/react-query';
import { z } from 'zod';

import type { QueryOptionsOverride } from '@/hooks/query-options';
import { queryKeys } from '@/lib/query-keys';
import { fetchAndParse } from '@/utils/fetch-and-parse';

const lookupResultSchema = z.object({
  notes: z.array(z.string()),
  confidence: z.enum(['high', 'medium', 'low']),
  sources: z.array(z.string()),
});
const responseSchema = z.object({ result: lookupResultSchema.nullable() });
type ReleaseNotesLookup = z.infer<typeof lookupResultSchema>;

/** Optional release facts the prose cites when the admin has entered them. */
export interface ReleaseNotesContext {
  releasedOn?: string;
  catalogNumber?: string;
  formats?: string[];
}

const fetchLookup = async (
  title: string,
  artist: string,
  { releasedOn, catalogNumber, formats }: ReleaseNotesContext,
  signal?: AbortSignal
): Promise<ReleaseNotesLookup | null> => {
  const params = new URLSearchParams({ title, artist });
  if (releasedOn) params.set('releasedOn', releasedOn);
  if (catalogNumber) params.set('catalogNumber', catalogNumber);
  if (formats && formats.length > 0) params.set('formats', formats.join(','));
  const { result } = await fetchAndParse(
    `/api/releases/notes-lookup?${params.toString()}`,
    responseSchema,
    { signal, errorMessage: 'Failed to generate the release notes' }
  );
  return result;
};

/**
 * On-demand web synthesis of release notes — two or three paragraphs naming
 * the artist, with attributed press quotes when the web offers them. Disabled
 * by default — call `refetch()` from the "Generate notes" button. Returns the
 * parsed result or null; forwards the AbortSignal.
 *
 * @param title - The release title to describe.
 * @param artist - The artist the notes must name.
 * @param context - Optional release date / catalog number / formats to cite.
 * @param options - Caller overrides spread last into `useQuery`.
 * @returns `{ isFetching, error, data, refetch }`.
 */
export const useReleaseNotesLookupQuery = (
  title: string,
  artist: string,
  context: ReleaseNotesContext = {},
  options: QueryOptionsOverride<ReleaseNotesLookup | null> = {}
) => {
  const { releasedOn, catalogNumber, formats } = context;
  const {
    isFetching,
    error = Error('Unknown error'),
    data,
    refetch,
  } = useQuery({
    queryKey: queryKeys.releases.notesLookup(title, artist, {
      releasedOn,
      catalogNumber,
      formats,
    }),
    queryFn: ({ signal }) =>
      fetchLookup(title, artist, { releasedOn, catalogNumber, formats }, signal),
    enabled: false,
    retry: false,
    ...options,
  });
  return { isFetching, error, data, refetch };
};
