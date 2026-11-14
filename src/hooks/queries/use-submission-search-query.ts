/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { keepPreviousData, useQuery } from '@tanstack/react-query';

import type { QueryOptionsOverride } from '@/hooks/query-options';
import { COMMUNITY_SEARCH_RESULTS } from '@/lib/constants/submissions';
import { queryKeys } from '@/lib/query-keys';
import type { SubmissionCard } from '@/lib/types/domain/submission';
import { submissionCardPageSchema } from '@/lib/validation/submission-listing-schema';
import { fetchAndParse } from '@/utils/fetch-and-parse';

/**
 * Fetches the few listed submissions that best match a term, newest first,
 * from the community page's listing route. An empty term fetches the newest.
 *
 * Forwards the TanStack Query {@link AbortSignal} to `fetch`, so a request
 * for a term the visitor has typed past is cancelled.
 *
 * @throws If the response status is not OK or the page is malformed.
 */
const fetchSubmissionMatches = async (
  search: string,
  signal?: AbortSignal
): Promise<SubmissionCard[]> => {
  const params = new URLSearchParams({ skip: '0', take: String(COMMUNITY_SEARCH_RESULTS) });
  if (search) params.set('search', search);

  const { rows } = await fetchAndParse(
    `/api/community/submissions?${params.toString()}`,
    submissionCardPageSchema,
    { signal, errorMessage: 'Failed to search submissions' }
  );

  return rows;
};

/**
 * React Query hook behind the community page's search: the listed
 * submissions whose title, about or owner's username holds the term.
 *
 * The term is trimmed and is part of the query key, so each term is cached.
 * `keepPreviousData` keeps the last results on screen while the next term
 * loads. Pass a debounced term.
 *
 * @param search - The debounced search term (empty suggests the newest).
 * @param options - Caller overrides spread into the `useQuery` call (e.g.
 * `enabled`); they take precedence over the defaults.
 * @returns The TanStack `useQuery` result; `data` is the matching cards.
 */
export const useSubmissionSearchQuery = (
  search = '',
  options: QueryOptionsOverride<SubmissionCard[]> = {}
) => {
  const term = search.trim();

  return useQuery({
    queryKey: queryKeys.submissions.search(term),
    queryFn: ({ signal }) => fetchSubmissionMatches(term, signal),
    placeholderData: keepPreviousData,
    ...options,
  });
};
