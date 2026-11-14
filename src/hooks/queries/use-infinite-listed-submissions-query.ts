/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { useInfiniteQuery } from '@tanstack/react-query';

import type { InfiniteQueryOptionsOverride } from '@/hooks/query-options';
import { COMMUNITY_PAGE_SIZE } from '@/lib/constants/submissions';
import { queryKeys } from '@/lib/query-keys';
import {
  submissionCardPageSchema,
  type SubmissionCardPage,
} from '@/lib/validation/submission-listing-schema';
import { fetchAndParse } from '@/utils/fetch-and-parse';

/** Request parameters for one page of `/api/community/submissions`. */
interface FetchListedSubmissionsParams {
  /** A username: only that user's listed submissions (empty fetches everyone's). */
  user: string;
  /** Offset of the page to fetch. */
  skip: number;
  /** The query's abort signal. */
  signal?: AbortSignal;
}

/**
 * Fetches one page of listed submissions, newest first, from the community
 * page's listing route, and validates it before returning it.
 *
 * Forwards the TanStack Query {@link AbortSignal} to `fetch`, so the request
 * is cancelled on unmount or by a superseding fetch.
 *
 * @throws If the response status is not OK or the page is malformed.
 */
const fetchListedSubmissions = async ({
  user,
  skip,
  signal,
}: FetchListedSubmissionsParams): Promise<SubmissionCardPage> => {
  const params = new URLSearchParams({ skip: String(skip), take: String(COMMUNITY_PAGE_SIZE) });
  if (user) params.set('user', user);

  return fetchAndParse(
    `/api/community/submissions?${params.toString()}`,
    submissionCardPageSchema,
    {
      signal,
      errorMessage: 'Failed to fetch submissions',
    }
  );
};

/**
 * React Query infinite hook for the community page's full list: every listed
 * submission, newest first, a page at a time for infinite scroll.
 *
 * `user` is part of the query key, so one user's list and everyone's are
 * cached apart. The first page is hydrated from the server's prefetch when
 * the key and `initialPageParam` match it.
 *
 * @param user - A username from `/community?user=`: only that user's listed
 * submissions (defaults to everyone's).
 * @param options - Caller overrides spread into the `useInfiniteQuery` call
 * (e.g. `enabled`, `staleTime`); they take precedence over the defaults.
 * @returns The TanStack `useInfiniteQuery` result (`data.pages`, `fetchNextPage`, etc.).
 */
export const useInfiniteListedSubmissionsQuery = (
  user = '',
  options: InfiniteQueryOptionsOverride<SubmissionCardPage> = {}
) =>
  useInfiniteQuery({
    queryKey: queryKeys.submissions.listedInfinite(user),
    queryFn: ({ pageParam, signal }) => fetchListedSubmissions({ user, skip: pageParam, signal }),
    initialPageParam: 0,
    getNextPageParam: (lastPage) => lastPage.nextSkip,
    ...options,
  });
