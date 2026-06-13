/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { useQuery } from '@tanstack/react-query';

import type { ReportedUsersResponse } from '@/app/api/admin/chat/reported-users/route';
import { queryKeys } from '@/lib/query-keys';

interface UseReportedUsersQueryParams {
  /** `null` = all-time. */
  windowDays: number | null;
  /** Case-insensitive substring filter on username (server-side). */
  search?: string;
}

/**
 * Fetches reported users from the `/api/admin/chat/reported-users` route handler.
 *
 * Forwards the TanStack Query {@link AbortSignal} to `fetch` so the request is
 * cancelled automatically on unmount, invalidation, or a superseding refetch.
 *
 * @param params - The window and search filters for the query.
 * @param signal - The `AbortSignal` forwarded from TanStack Query.
 * @returns The parsed reported-users response.
 * @throws If the response status is not OK.
 */
const fetchReportedUsers = async (
  { windowDays, search }: UseReportedUsersQueryParams,
  signal?: AbortSignal
): Promise<ReportedUsersResponse> => {
  const params = new URLSearchParams();
  if (windowDays !== null) params.set('windowDays', String(windowDays));
  if (search) params.set('search', search);
  const query = params.toString();
  const response = await fetch(`/api/admin/chat/reported-users${query ? `?${query}` : ''}`, {
    cache: 'no-store',
    signal,
  });
  if (!response.ok) {
    throw Error('Failed to load reported users');
  }
  return (await response.json()) as ReportedUsersResponse;
};

/**
 * React Query hook for fetching reported users.
 *
 * Wraps {@link fetchReportedUsers} with a stable query key and exposes the
 * request state. Cancellation is handled automatically via the forwarded
 * `AbortSignal`.
 *
 * @param params - The window and search filters for the query.
 * @returns The full TanStack Query result for the reported-users request.
 */
export function useReportedUsersQuery(params: UseReportedUsersQueryParams) {
  return useQuery({
    queryKey: queryKeys.chat.reportedUsers(params.windowDays ?? 'all', params.search),
    queryFn: ({ signal }) => fetchReportedUsers(params, signal),
  });
}
