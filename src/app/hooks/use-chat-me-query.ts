/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { useQuery } from '@tanstack/react-query';

import type { ChatMeResponse } from '@/app/api/chat/me/route';
import { queryKeys } from '@/lib/query-keys';

const fetchMe = async (): Promise<ChatMeResponse> => {
  const response = await fetch('/api/chat/me', { cache: 'no-store' });
  if (!response.ok) {
    throw Error('Failed to load chat status');
  }
  return (await response.json()) as ChatMeResponse;
};

/**
 * Polls `/api/chat/me` to determine whether the viewer is permitted
 * to interact with chat. Used by {@link ChatBody} to swap in the
 * disabled-user UX when the user has been reported and disabled (or
 * when a {@link BannedIdentity} matches their session).
 *
 * `enabled` lets the caller defer the request until the drawer opens.
 */
export function useChatMeQuery({ enabled }: { enabled: boolean }) {
  return useQuery({
    queryKey: queryKeys.chat.me(),
    queryFn: fetchMe,
    enabled,
    // Status is read-mostly; cache it for a minute so opening and
    // closing the drawer doesn't slam the endpoint, but refresh on
    // window focus so a freshly disabled user sees the gate quickly.
    staleTime: 60_000,
    refetchOnWindowFocus: true,
  });
}
