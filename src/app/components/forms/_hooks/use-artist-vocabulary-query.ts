/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { z } from 'zod';

import type { QueryOptionsOverride } from '@/hooks/query-options';
import { queryKeys } from '@/lib/query-keys';
import type { ArtistVocabularyEntry, ArtistVocabularyField } from '@/lib/types/domain/artist';
import { fetchAndParse } from '@/utils/fetch-and-parse';

const vocabularyEntrySchema = z.object({ value: z.string(), count: z.number() });
const vocabularyResponseSchema = z.object({ results: z.array(vocabularyEntrySchema) });

/** Reads naturally in a toast: "Failed to load genre suggestions". */
const fieldNoun = (field: ArtistVocabularyField): string => {
  switch (field) {
    case 'genres':
      return 'genre';
    case 'tags':
      return 'tag';
  }
};

const fetchVocabulary = async (
  field: ArtistVocabularyField,
  query: string,
  signal?: AbortSignal
): Promise<ArtistVocabularyEntry[]> => {
  const { results } = await fetchAndParse(
    `/api/artists/vocabulary?field=${field}&q=${encodeURIComponent(query)}`,
    vocabularyResponseSchema,
    { signal, errorMessage: `Failed to load ${fieldNoun(field)} suggestions` }
  );
  return results;
};

/**
 * Usage-ranked genre or tag suggestions for the admin artist form's pill
 * editors. Forwards the AbortSignal for auto-cancellation.
 *
 * Deliberately sets no `enabled`: unlike `useProducersSearchQuery`, an empty
 * query here is meaningful — it asks for the top terms, which is what the
 * dropdown shows before anyone types. "Don't fetch until the popover opens" is
 * a UI-lifecycle concern, so the caller passes it through `options`.
 *
 * @param field - Which vocabulary column to search.
 * @param query - The current combobox search text.
 * @param options - Caller overrides spread last into `useQuery`.
 * @returns `{ isPending, error, data, refetch }`.
 */
export const useArtistVocabularyQuery = (
  field: ArtistVocabularyField,
  query: string,
  options: QueryOptionsOverride<ArtistVocabularyEntry[]> = {}
) => {
  const trimmed = query.trim();
  const {
    isPending,
    error = Error('Unknown error'),
    data,
    refetch,
  } = useQuery({
    queryKey: queryKeys.artists.vocabulary(field, trimmed),
    queryFn: ({ signal }) => fetchVocabulary(field, trimmed, signal),
    placeholderData: keepPreviousData,
    ...options,
  });
  return { isPending, error, data, refetch };
};
