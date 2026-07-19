/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { keepPreviousData, useInfiniteQuery } from '@tanstack/react-query';
import { z } from 'zod';

import type { ReportedUsersResponse } from '@/app/api/admin/chat/reported-users/route';
import { queryKeys } from '@/lib/query-keys';
import { paginatedResponseSchema } from '@/lib/validation/pagination-schema';
import { fetchAndParse } from '@/utils/fetch-and-parse';

import type { InfiniteQueryOptionsOverride } from './query-options';

/** Page size requested per fetch. */
export const REPORTED_USERS_PAGE_SIZE = 24;

const reportedUserDtoSchema = z.object({
  userId: z.string(),
  username: z.string().nullable(),
  email: z.string(),
  reportCount: z.number(),
  latestReportedAt: z.string(),
  chatDisabled: z.boolean(),
});

const reportedUsersResponseSchema = paginatedResponseSchema(reportedUserDtoSchema);

interface UseReportedUsersQueryParams {
  /** `null` = all-time. */
  windowDays: number | null;
  /** Case-insensitive substring filter on username/email (server-side). */
  search?: string;
}

/**
 * Fetches one page of reported users from the
 * `/api/admin/chat/reported-users` route handler.
 *
 * Forwards the TanStack Query {@link AbortSignal} to `fetch` so the request is
 * cancelled automatically on unmount, invalidation, or a superseding refetch.
 *
 * @param params - The window and search filters for the query.
 * @param skip - Offset of the page to fetch.
 * @param signal - The `AbortSignal` forwarded from TanStack Query.
 * @returns The page of reported users plus the `nextSkip` cursor.
 * @throws If the response status is not OK.
 */
const fetchReportedUsers = async (
  { windowDays, search }: UseReportedUsersQueryParams,
  skip: number,
  signal?: AbortSignal
): Promise<ReportedUsersResponse> => {
  const params = new URLSearchParams({
    skip: String(skip),
    take: String(REPORTED_USERS_PAGE_SIZE),
  });
  if (windowDays !== null) params.set('windowDays', String(windowDays));
  if (search) params.set('search', search);

  const url = `/api/admin/chat/reported-users?${params.toString()}`;
  return fetchAndParse(url, reportedUsersResponseSchema, {
    signal,
    cache: 'no-store',
    errorMessage: 'Failed to load reported users',
  });
};

/**
 * React Query infinite hook for the admin reported-users list.
 *
 * Pages through `/api/admin/chat/reported-users` via skip/offset. `search` is
 * applied server-side and is part of the query key, so changing it resets
 * pagination; `keepPreviousData` keeps results visible during a search
 * transition. Cancellation is automatic via the forwarded `AbortSignal`.
 *
 * @param params - The window and search filters for the query.
 * @param options - Caller overrides spread into the `useInfiniteQuery` call
 * (e.g. `enabled`, `staleTime`); they take precedence over the defaults below.
 * @returns The TanStack `useInfiniteQuery` result (`data.pages`, `fetchNextPage`, etc.).
 */
export const useInfiniteReportedUsersQuery = (
  params: UseReportedUsersQueryParams,
  options: InfiniteQueryOptionsOverride<ReportedUsersResponse> = {}
) =>
  useInfiniteQuery({
    queryKey: queryKeys.chat.reportedUsersInfinite(params),
    queryFn: ({ pageParam, signal }) => fetchReportedUsers(params, pageParam, signal),
    initialPageParam: 0,
    getNextPageParam: (lastPage) => lastPage.nextSkip,
    placeholderData: keepPreviousData,
    ...options,
  });
