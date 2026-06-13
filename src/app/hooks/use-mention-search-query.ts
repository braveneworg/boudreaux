/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { keepPreviousData, useQuery } from '@tanstack/react-query';

import { queryKeys } from '@/lib/query-keys';

export interface MentionMatch {
  id: string;
  username: string;
}

interface MentionSearchResponse {
  matches: MentionMatch[];
}

/**
 * Prefix-search usernames for the chat composer autocomplete. The query
 * is gated on a non-empty prefix so the popover stays idle until the
 * user has typed at least one character after `@`.
 *
 * The inline `queryFn` hits the `/api/chat/mention-search` route handler and
 * forwards the TanStack Query {@link AbortSignal} to `fetch`, so the request is
 * cancelled automatically on unmount, invalidation, or a superseding refetch.
 *
 * @param prefix - The username prefix typed after `@`.
 * @param enabled - Whether the query should run.
 * @returns The full TanStack Query result for the matched mentions.
 */
export function useMentionSearchQuery(prefix: string, enabled: boolean) {
  const trimmed = prefix.trim().slice(0, 32);
  return useQuery({
    queryKey: queryKeys.chat.mentionSearch(trimmed),
    queryFn: async ({ signal }) => {
      const params = new URLSearchParams({ q: trimmed });
      const response = await fetch(`/api/chat/mention-search?${params.toString()}`, {
        signal,
        cache: 'no-store',
      });
      if (!response.ok) throw Error('Mention search failed');
      const data = (await response.json()) as MentionSearchResponse;
      return data.matches;
    },
    enabled: enabled && trimmed.length > 0,
    staleTime: 30_000,
    placeholderData: keepPreviousData,
  });
}
