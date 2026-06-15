/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { useInfiniteQuery } from '@tanstack/react-query';
import { z } from 'zod';

import type {
  AdminUserMessageDto,
  AdminUserMessagesResponse,
} from '@/app/api/admin/chat/users/[userId]/messages/route';
import { queryKeys } from '@/lib/query-keys';
import { paginatedResponseSchema } from '@/lib/validation/pagination-schema';

import { fetchAndParse } from './fetch-and-parse';

import type { InfiniteQueryOptionsOverride } from './query-options';

const PAGE_SIZE = 25;

const adminUserMessageDtoSchema = z.object({
  id: z.string(),
  body: z.string(),
  createdAt: z.string(),
  hiddenAt: z.string().nullable(),
  hiddenReason: z.string().nullable(),
}) satisfies z.ZodType<AdminUserMessageDto>;

const adminUserMessagesResponseSchema = paginatedResponseSchema(adminUserMessageDtoSchema);

/**
 * Fetches a page of admin user chat messages from the
 * `/api/admin/chat/users/:userId/messages` route handler.
 *
 * Forwards the TanStack Query {@link AbortSignal} to `fetch` so the request is
 * cancelled automatically on unmount, invalidation, or a superseding refetch.
 *
 * @param args - The `userId`, page `skip` offset, and the `signal` to cancel
 * the request.
 * @returns The parsed JSON response containing the messages page.
 * @throws If the response status is not OK.
 */
const fetchPage = async ({
  userId,
  skip,
  signal,
}: {
  userId: string;
  skip: number;
  signal?: AbortSignal;
}): Promise<AdminUserMessagesResponse> => {
  const params = new URLSearchParams({
    skip: String(skip),
    take: String(PAGE_SIZE),
  });
  const url = `/api/admin/chat/users/${userId}/messages?${params.toString()}`;
  return fetchAndParse(url, adminUserMessagesResponseSchema, {
    signal,
    cache: 'no-store',
    errorMessage: 'Failed to load user messages',
  });
};

/**
 * React Query infinite-query hook for paginating an admin user's chat messages.
 *
 * Wraps {@link fetchPage} with a stable query key and exposes the infinite
 * query state. Cancellation is handled automatically via the forwarded
 * `AbortSignal`.
 *
 * @param userId - The id of the user whose messages are being paginated.
 * @param options - Caller overrides spread into the `useInfiniteQuery` call
 * (e.g. `enabled`, `staleTime`).
 * @returns The full TanStack Query infinite-query result.
 */
export const useAdminUserMessagesQuery = (
  userId: string,
  options: InfiniteQueryOptionsOverride<AdminUserMessagesResponse> = {}
) =>
  useInfiniteQuery({
    queryKey: queryKeys.chat.userMessages(userId),
    queryFn: ({ pageParam, signal }) => fetchPage({ userId, skip: pageParam, signal }),
    initialPageParam: 0,
    getNextPageParam: (lastPage) => lastPage.nextSkip,
    ...options,
  });
