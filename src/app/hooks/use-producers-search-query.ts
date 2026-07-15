/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { z } from 'zod';

import { queryKeys } from '@/lib/query-keys';

import { fetchAndParse } from './fetch-and-parse';

import type { QueryOptionsOverride } from './query-options';

const producerSummarySchema = z.object({ id: z.string(), name: z.string() });
const producerSearchResponseSchema = z.object({ results: z.array(producerSummarySchema) });
type ProducerSummary = z.infer<typeof producerSummarySchema>;

const MIN_SEARCH_LENGTH = 2;

const fetchProducerSearch = async (
  query: string,
  signal?: AbortSignal
): Promise<ProducerSummary[]> => {
  const { results } = await fetchAndParse(
    `/api/producers/search?q=${encodeURIComponent(query)}`,
    producerSearchResponseSchema,
    { signal, errorMessage: 'Failed to search producers' }
  );
  return results;
};

/**
 * Search the producer catalog for the admin video form combobox. Disabled for
 * queries under two characters; forwards the AbortSignal for auto-cancellation.
 *
 * @param query - The current combobox search text.
 * @param options - Caller overrides spread last into `useQuery`.
 * @returns `{ isPending, error, data, refetch }`.
 */
export const useProducersSearchQuery = (
  query: string,
  options: QueryOptionsOverride<ProducerSummary[]> = {}
) => {
  const trimmed = query.trim();
  const {
    isPending,
    error = Error('Unknown error'),
    data,
    refetch,
  } = useQuery({
    queryKey: queryKeys.producers.search(trimmed),
    queryFn: ({ signal }) => fetchProducerSearch(trimmed, signal),
    enabled: trimmed.length >= MIN_SEARCH_LENGTH,
    placeholderData: keepPreviousData,
    ...options,
  });
  return { isPending, error, data, refetch };
};
