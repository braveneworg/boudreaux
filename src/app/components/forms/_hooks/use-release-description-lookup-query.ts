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
type ReleaseDescriptionLookup = z.infer<typeof lookupResultSchema>;

/** Optional release facts the blurb is grounded in when the admin has them. */
export interface ReleaseDescriptionContext {
  releasedOn?: string;
  catalogNumber?: string;
  formats?: string[];
  /** The label's authored notes, verbatim from the textarea (newline-delimited). */
  labelNotes?: string;
}

const fetchLookup = async (
  title: string,
  artist: string,
  { releasedOn, catalogNumber, formats, labelNotes }: ReleaseDescriptionContext,
  signal?: AbortSignal
): Promise<ReleaseDescriptionLookup | null> => {
  const params = new URLSearchParams({ title, artist });
  if (releasedOn) params.set('releasedOn', releasedOn);
  if (catalogNumber) params.set('catalogNumber', catalogNumber);
  if (formats && formats.length > 0) params.set('formats', formats.join(','));
  if (labelNotes?.trim()) params.set('labelNotes', labelNotes);
  const { result } = await fetchAndParse(
    `/api/releases/description-lookup?${params.toString()}`,
    responseSchema,
    { signal, errorMessage: 'Failed to generate the blurb' }
  );
  return result;
};

/**
 * On-demand web synthesis of the short listing blurb — ~500 characters naming
 * the artist, built on the label's own notes with attributed press quotes when
 * the web offers them. Disabled by default — call `refetch()` from the
 * "Generate blurb" button. Returns the parsed result or null; forwards the
 * AbortSignal.
 *
 * @param title - The release title to describe.
 * @param artist - The artist the blurb must name.
 * @param context - Optional release facts plus the label's authored notes.
 * @param options - Caller overrides spread last into `useQuery`.
 * @returns `{ isFetching, error, data, refetch }`.
 */
export const useReleaseDescriptionLookupQuery = (
  title: string,
  artist: string,
  context: ReleaseDescriptionContext = {},
  options: QueryOptionsOverride<ReleaseDescriptionLookup | null> = {}
) => {
  const { releasedOn, catalogNumber, formats, labelNotes } = context;
  const {
    isFetching,
    error = Error('Unknown error'),
    data,
    refetch,
  } = useQuery({
    queryKey: queryKeys.releases.descriptionLookup(title, artist, {
      releasedOn,
      catalogNumber,
      formats,
      labelNotes,
    }),
    queryFn: ({ signal }) =>
      fetchLookup(title, artist, { releasedOn, catalogNumber, formats, labelNotes }, signal),
    enabled: false,
    retry: false,
    ...options,
  });
  return { isFetching, error, data, refetch };
};
