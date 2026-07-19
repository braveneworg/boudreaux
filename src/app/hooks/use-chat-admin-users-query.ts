/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { useQuery } from '@tanstack/react-query';
import { z } from 'zod';

import { queryKeys } from '@/lib/query-keys';
import type { ChatUsersSortBy, ListChatUsersResult } from '@/lib/services/chat-admin-service';
import { fetchAndParse } from '@/utils/fetch-and-parse';

import type { QueryOptionsOverride } from './query-options';

interface UseChatAdminUsersQueryParams {
  page: number;
  perPage: number;
  sortBy: ChatUsersSortBy;
  sortDirection: 'asc' | 'desc';
}

const chatUserAdminDtoSchema = z.object({
  id: z.string(),
  userId: z.string(),
  username: z.string().nullable(),
  email: z.string(),
  fingerprint: z.string(),
  ipAddress: z.string(),
  messageCount: z.number(),
  flagged: z.boolean(),
  disabled: z.boolean(),
  lastSeenAt: z.string(),
  createdAt: z.string(),
});

const listChatUsersResultSchema = z.object({
  rows: z.array(chatUserAdminDtoSchema),
  total: z.number(),
  page: z.number(),
  perPage: z.number(),
}) satisfies z.ZodType<ListChatUsersResult>;

/**
 * Fetches a page of admin chat users from the `/api/admin/chat/users` route
 * handler.
 *
 * Forwards the TanStack Query {@link AbortSignal} to `fetch` so the request is
 * cancelled automatically on unmount, invalidation, or a superseding refetch.
 *
 * @param params - The page, pagination, and sort parameters for the request.
 * @param signal - The TanStack Query `AbortSignal` used to cancel the request.
 * @returns The parsed JSON response containing the chat users page.
 * @throws If the response status is not OK.
 */
const fetchChatAdminUsers = async (
  { page, perPage, sortBy, sortDirection }: UseChatAdminUsersQueryParams,
  signal?: AbortSignal
): Promise<ListChatUsersResult> => {
  const params = new URLSearchParams({
    page: String(page),
    perPage: String(perPage),
    sortBy,
    sortDirection,
  });
  const url = `/api/admin/chat/users?${params.toString()}`;
  return fetchAndParse(url, listChatUsersResultSchema, {
    signal,
    cache: 'no-store',
    errorMessage: 'Failed to load chat users',
  });
};

/**
 * React Query hook for fetching a paginated list of admin chat users.
 *
 * Wraps {@link fetchChatAdminUsers} with a stable query key and exposes the request
 * state. Cancellation is handled automatically via the forwarded `AbortSignal`.
 *
 * @param params - The page, pagination, and sort parameters for the request.
 * @param options - Caller overrides spread into the `useQuery` call (e.g.
 * `enabled`, `staleTime`).
 * @returns The full TanStack Query result for the chat users page.
 */
export const useChatAdminUsersQuery = (
  params: UseChatAdminUsersQueryParams,
  options: QueryOptionsOverride<ListChatUsersResult> = {}
) =>
  useQuery({
    queryKey: queryKeys.chat.adminUsers(params),
    queryFn: ({ signal }) => fetchChatAdminUsers(params, signal),
    ...options,
  });
