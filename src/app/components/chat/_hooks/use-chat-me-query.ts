/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { useQuery, type QueryFunctionContext } from '@tanstack/react-query';
import { z } from 'zod';

import type { ChatMeResponse } from '@/app/api/chat/me/route';
import type { QueryOptionsOverride } from '@/hooks/query-options';
import { queryKeys } from '@/lib/query-keys';
import { fetchAndParse } from '@/utils/fetch-and-parse';

const chatMeResponseSchema = z.object({ blocked: z.boolean() }) satisfies z.ZodType<ChatMeResponse>;

/**
 * Fetches the viewer's chat status from the `/api/chat/me` route handler.
 *
 * Forwards the TanStack Query {@link AbortSignal} to `fetch` so the request is
 * cancelled automatically on unmount, invalidation, or a superseding refetch.
 *
 * @param context - The TanStack Query function context, providing the `signal`.
 * @returns The parsed JSON response containing the viewer's chat status.
 * @throws If the response status is not OK.
 */
const fetchMe = async ({ signal }: QueryFunctionContext): Promise<ChatMeResponse> =>
  fetchAndParse('/api/chat/me', chatMeResponseSchema, {
    signal,
    cache: 'no-store',
    errorMessage: 'Failed to load chat status',
  });

/**
 * Polls `/api/chat/me` to determine whether the viewer is permitted
 * to interact with chat. Used by {@link ChatBody} to swap in the
 * disabled-user UX when the user has been reported and disabled (or
 * when a {@link BannedIdentity} matches their session).
 *
 * Pass `enabled` via `options` to defer the request until the drawer opens.
 * Wraps {@link fetchMe}; cancellation is handled automatically via the
 * forwarded `AbortSignal`.
 *
 * @param options - Caller overrides spread into the `useQuery` call (e.g.
 * `enabled`); they take precedence over the defaults below.
 */
export const useChatMeQuery = (options: QueryOptionsOverride<ChatMeResponse> = {}) =>
  useQuery({
    queryKey: queryKeys.chat.me(),
    queryFn: fetchMe,
    // Status is read-mostly; cache it for a minute so opening and
    // closing the drawer doesn't slam the endpoint, but refresh on
    // window focus so a freshly disabled user sees the gate quickly.
    staleTime: 60_000,
    refetchOnWindowFocus: true,
    ...options,
  });
