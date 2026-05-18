/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { useQuery } from '@tanstack/react-query';

import { queryKeys } from '@/lib/query-keys';
import type { ChatMessageDto } from '@/lib/services/chat-service';

interface PinnedResponse {
  messages: ChatMessageDto[];
}

const fetchPinned = async (): Promise<ChatMessageDto[]> => {
  const response = await fetch('/api/chat/pinned', { cache: 'no-store' });
  if (!response.ok) {
    throw Error('Failed to load pinned messages');
  }
  const json = (await response.json()) as PinnedResponse;
  return json.messages;
};

/**
 * Loads the currently pinned admin announcements so the pinned strip
 * survives a page reload even when the pinned rows are older than the
 * loaded chat-history page. Live updates land via the `messagePinChanged`
 * Pusher event and patch this cache directly.
 */
export function useChatPinnedMessagesQuery({ enabled }: { enabled: boolean }) {
  return useQuery({
    queryKey: queryKeys.chat.pinned(),
    queryFn: fetchPinned,
    enabled,
    staleTime: 30_000,
    refetchOnWindowFocus: true,
  });
}
