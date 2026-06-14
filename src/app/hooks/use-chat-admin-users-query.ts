/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { useQuery } from '@tanstack/react-query';

import { queryKeys } from '@/lib/query-keys';
import type { ChatUsersSortBy, ListChatUsersResult } from '@/lib/services/chat-admin-service';

import type { QueryOptionsOverride } from './query-options';

interface UseChatAdminUsersQueryParams {
  page: number;
  perPage: number;
  sortBy: ChatUsersSortBy;
  sortDirection: 'asc' | 'desc';
}

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
const fetchPage = async (
  { page, perPage, sortBy, sortDirection }: UseChatAdminUsersQueryParams,
  signal?: AbortSignal
): Promise<ListChatUsersResult> => {
  const params = new URLSearchParams({
    page: String(page),
    perPage: String(perPage),
    sortBy,
    sortDirection,
  });
  const response = await fetch(`/api/admin/chat/users?${params.toString()}`, {
    cache: 'no-store',
    signal,
  });
  if (!response.ok) {
    throw Error('Failed to load chat users');
  }
  return (await response.json()) as ListChatUsersResult;
};

/**
 * React Query hook for fetching a paginated list of admin chat users.
 *
 * Wraps {@link fetchPage} with a stable query key and exposes the request
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
    queryKey: queryKeys.chat.adminUsers(params.page, params.sortBy, params.sortDirection),
    queryFn: ({ signal }) => fetchPage(params, signal),
    ...options,
  });
