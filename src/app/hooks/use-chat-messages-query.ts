/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { useInfiniteQuery } from '@tanstack/react-query';

import { queryKeys } from '@/lib/query-keys';
import type { ChatMessageDto } from '@/lib/services/chat-service';

import type { InfiniteQueryOptionsOverride } from './query-options';

interface ChatMessagesPage {
  messages: ChatMessageDto[];
}

interface ChatCursor {
  cursorCreatedAt: string;
  cursorId: string;
}

const PAGE_SIZE = 20;

/** Hard cap on total messages held in memory (matches spec's 200 ceiling). */
export const MAX_TOTAL_MESSAGES = 200;

/**
 * Fetches a single page of chat history from the `/api/chat/messages` route
 * handler.
 *
 * Forwards the TanStack Query {@link AbortSignal} to `fetch` so the request is
 * cancelled automatically on unmount, invalidation, or a superseding refetch.
 *
 * @param params - The infinite-query page context: the `pageParam` cursor and
 * the `signal` forwarded to `fetch`.
 * @returns The parsed JSON response containing one page of messages.
 * @throws If the response status is not OK.
 */
const fetchPage = async ({
  pageParam,
  signal,
}: {
  pageParam: ChatCursor | undefined;
  signal?: AbortSignal;
}): Promise<ChatMessagesPage> => {
  const params = new URLSearchParams({ limit: String(PAGE_SIZE) });
  if (pageParam) {
    params.set('cursorCreatedAt', pageParam.cursorCreatedAt);
    params.set('cursorId', pageParam.cursorId);
  }
  const response = await fetch(`/api/chat/messages?${params.toString()}`, {
    cache: 'no-store',
    signal,
  });
  if (!response.ok) {
    throw Error('Failed to load chat messages');
  }
  return (await response.json()) as ChatMessagesPage;
};

/**
 * Infinite query over the chat history. The first page is the most
 * recent 20 messages (chronological within the page). Each subsequent
 * `fetchNextPage()` prepends an older 20-message slice.
 *
 * The flattened ordering — oldest → newest — is exposed via `messages`
 * on the returned object; UI code never has to think about pages.
 *
 * Wraps {@link fetchPage}; cancellation is handled automatically via the
 * forwarded `AbortSignal`.
 *
 * @param options - Caller overrides spread into the `useInfiniteQuery` call
 * (e.g. `enabled`); they take precedence over the defaults below.
 * @returns The flattened `messages` plus paging/request state:
 * `isPending`, `isError`, `error`, `hasNextPage`, `isFetchingNextPage`,
 * `fetchNextPage`, and `refetch`.
 */
export const useChatMessagesQuery = (
  options: InfiniteQueryOptionsOverride<ChatMessagesPage, ChatCursor | undefined> = {}
) => {
  const result = useInfiniteQuery({
    queryKey: queryKeys.chat.messages(),
    queryFn: ({ pageParam, signal }) => fetchPage({ pageParam, signal }),
    initialPageParam: undefined as ChatCursor | undefined,
    getNextPageParam: (lastPage) => {
      if (lastPage.messages.length < PAGE_SIZE) return undefined;
      const oldest = lastPage.messages[0];
      if (!oldest) return undefined;
      return { cursorCreatedAt: oldest.createdAt, cursorId: oldest.id };
    },
    ...options,
    enabled: options.enabled ?? true,
  });

  // Pages arrive newest-page-first; flatten oldest → newest for rendering.
  const messages = result.data
    ? result.data.pages
        .slice()
        .reverse()
        .flatMap((page) => page.messages)
    : [];

  const hasReachedCap = messages.length >= MAX_TOTAL_MESSAGES;

  return {
    messages,
    isPending: result.isPending,
    isError: result.isError,
    error: result.error,
    hasNextPage: result.hasNextPage && !hasReachedCap,
    isFetchingNextPage: result.isFetchingNextPage,
    fetchNextPage: result.fetchNextPage,
    refetch: result.refetch,
  };
};
