/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { useEffect, useRef } from 'react';

import { useQueryClient } from '@tanstack/react-query';

import { queryKeys } from '@/lib/query-keys';

/** Shape-agnostic view of the infinite-query cache — only references move. */
interface TrimmableInfiniteData {
  pages: unknown[];
  pageParams: unknown[];
}

interface UseChatReopenRefreshParams {
  /** Mirrors the chat queries' enabled state (drawer open + not blocked). */
  enabled: boolean;
}

/**
 * Refreshes the cached chat history when the drawer (re)opens.
 *
 * The chat body unmounts when the drawer closes, the Pusher channel
 * unsubscribes, and the messages query sits under the global 5-minute
 * `staleTime` — so on reopen the cached pages can silently miss anything
 * that happened while closed. On the first enabled render per mount this
 * hook trims the cache to its newest page (so an invalidation refetches
 * one page instead of every accumulated older page) and invalidates the
 * messages + pinned queries. Cached rows keep rendering while the
 * background refetch runs, so there is no loading flash.
 *
 * A cold cache (first-ever open) is left alone — the initial fetch is
 * already fresh.
 */
export const useChatReopenRefresh = ({ enabled }: UseChatReopenRefreshParams): void => {
  const queryClient = useQueryClient();
  const hasRefreshedRef = useRef(false);

  useEffect(() => {
    if (!enabled || hasRefreshedRef.current) return;
    hasRefreshedRef.current = true;

    const data = queryClient.getQueryData<TrimmableInfiniteData>(queryKeys.chat.messages());
    if (!data) return;

    if (data.pages.length > 1) {
      queryClient.setQueryData<TrimmableInfiniteData>(queryKeys.chat.messages(), {
        pages: [data.pages[0]],
        pageParams: [data.pageParams[0]],
      });
    }
    void queryClient.invalidateQueries({ queryKey: queryKeys.chat.messages() });
    void queryClient.invalidateQueries({ queryKey: queryKeys.chat.pinned() });
  }, [enabled, queryClient]);
};
