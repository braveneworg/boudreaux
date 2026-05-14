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

const fetchReportedUsers = async ({
  windowDays,
  search,
}: UseReportedUsersQueryParams): Promise<ReportedUsersResponse> => {
  const params = new URLSearchParams();
  if (windowDays !== null) params.set('windowDays', String(windowDays));
  if (search) params.set('search', search);
  const query = params.toString();
  const response = await fetch(`/api/admin/chat/reported-users${query ? `?${query}` : ''}`, {
    cache: 'no-store',
  });
  if (!response.ok) {
    throw Error('Failed to load reported users');
  }
  return (await response.json()) as ReportedUsersResponse;
};

export function useReportedUsersQuery(params: UseReportedUsersQueryParams) {
  return useQuery({
    queryKey: queryKeys.chat.reportedUsers(params.windowDays ?? 'all'),
    queryFn: () => fetchReportedUsers(params),
  });
}
