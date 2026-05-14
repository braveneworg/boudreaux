/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { useQuery } from '@tanstack/react-query';

import { queryKeys } from '@/lib/query-keys';
import type { ChatUsersSortBy, ListChatUsersResult } from '@/lib/services/chat-admin-service';

interface UseChatAdminUsersQueryParams {
  page: number;
  perPage: number;
  sortBy: ChatUsersSortBy;
  sortDirection: 'asc' | 'desc';
}

const fetchPage = async ({
  page,
  perPage,
  sortBy,
  sortDirection,
}: UseChatAdminUsersQueryParams): Promise<ListChatUsersResult> => {
  const params = new URLSearchParams({
    page: String(page),
    perPage: String(perPage),
    sortBy,
    sortDirection,
  });
  const response = await fetch(`/api/admin/chat/users?${params.toString()}`, {
    cache: 'no-store',
  });
  if (!response.ok) {
    throw Error('Failed to load chat users');
  }
  return (await response.json()) as ListChatUsersResult;
};

export function useChatAdminUsersQuery(params: UseChatAdminUsersQueryParams) {
  return useQuery({
    queryKey: queryKeys.chat.adminUsers(params.page, params.sortBy, params.sortDirection),
    queryFn: () => fetchPage(params),
  });
}
