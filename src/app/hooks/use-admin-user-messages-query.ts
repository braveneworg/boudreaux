/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { useInfiniteQuery } from '@tanstack/react-query';

import type { AdminUserMessagesResponse } from '@/app/api/admin/chat/users/[userId]/messages/route';
import { queryKeys } from '@/lib/query-keys';

const PAGE_SIZE = 25;

const fetchPage = async ({
  userId,
  skip,
}: {
  userId: string;
  skip: number;
}): Promise<AdminUserMessagesResponse> => {
  const params = new URLSearchParams({
    skip: String(skip),
    take: String(PAGE_SIZE),
  });
  const response = await fetch(`/api/admin/chat/users/${userId}/messages?${params.toString()}`, {
    cache: 'no-store',
  });
  if (!response.ok) {
    throw Error('Failed to load user messages');
  }
  return (await response.json()) as AdminUserMessagesResponse;
};

export function useAdminUserMessagesQuery(userId: string) {
  return useInfiniteQuery({
    queryKey: queryKeys.chat.userMessages(userId),
    queryFn: ({ pageParam }) => fetchPage({ userId, skip: pageParam }),
    initialPageParam: 0,
    getNextPageParam: (lastPage) => lastPage.nextSkip,
  });
}
