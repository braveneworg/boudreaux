/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { useQuery, type QueryFunctionContext } from '@tanstack/react-query';
import { z } from 'zod';

import { queryKeys } from '@/lib/query-keys';
import type { ChatMessageDto } from '@/lib/services/chat-service';
import { chatMessageDtoSchema } from '@/lib/validation/chat-message-schema';
import { fetchAndParse } from '@/utils/fetch-and-parse';

import type { QueryOptionsOverride } from './query-options';

interface PinnedResponse {
  messages: ChatMessageDto[];
}

const pinnedResponseSchema = z.object({
  messages: z.array(chatMessageDtoSchema),
}) satisfies z.ZodType<PinnedResponse>;

/**
 * Fetches the currently pinned chat messages from the `/api/chat/pinned`
 * route handler.
 *
 * Forwards the TanStack Query {@link AbortSignal} to `fetch` so the request is
 * cancelled automatically on unmount, invalidation, or a superseding refetch.
 *
 * @param context - The TanStack Query function context, providing the `signal`.
 * @returns The list of pinned chat messages.
 * @throws If the response status is not OK.
 */
const fetchPinned = async ({ signal }: QueryFunctionContext): Promise<ChatMessageDto[]> => {
  const { messages } = await fetchAndParse('/api/chat/pinned', pinnedResponseSchema, {
    signal,
    cache: 'no-store',
    errorMessage: 'Failed to load pinned messages',
  });
  return messages;
};

/**
 * Loads the currently pinned admin announcements so the pinned strip
 * survives a page reload even when the pinned rows are older than the
 * loaded chat-history page. Live updates land via the `messagePinChanged`
 * Pusher event and patch this cache directly.
 *
 * Wraps {@link fetchPinned}; cancellation is handled automatically via the
 * forwarded `AbortSignal`.
 *
 * @param options - Caller overrides spread into the `useQuery` call (e.g.
 * `enabled`); they take precedence over the defaults below.
 */
export const useChatPinnedMessagesQuery = (options: QueryOptionsOverride<ChatMessageDto[]> = {}) =>
  useQuery({
    queryKey: queryKeys.chat.pinned(),
    queryFn: fetchPinned,
    staleTime: 30_000,
    refetchOnWindowFocus: true,
    ...options,
  });
