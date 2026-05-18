/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { useQueryClient } from '@tanstack/react-query';

import { queryKeys } from '@/lib/query-keys';
import type { ChatMessageDto } from '@/lib/services/chat-service';

interface ChatMessagesPage {
  messages: ChatMessageDto[];
}

interface ChatMessagesInfiniteData {
  pages: ChatMessagesPage[];
  pageParams: unknown[];
}

export interface OptimisticChatMessage extends ChatMessageDto {
  /** Set on optimistic placeholders before the server echo lands. */
  tempId?: string;
  /** Set when the user's send failed (e.g., rate-limited). */
  failed?: boolean;
}

interface UseOptimisticChatParams {
  /** Persisted messages from the infinite query, oldest → newest. */
  baseMessages: ChatMessageDto[];
}

/**
 * Layers optimistic / failed sends on top of the persisted history and
 * reconciles them when Pusher echoes the server-persisted message back.
 *
 * Echo dedupe rules:
 *   - When the server echo arrives via `addReceivedMessage`, drop any
 *     local optimistic entry authored by the same user with identical
 *     body and a newer-than-cutoff createdAt — the persisted DTO wins.
 *   - When a send fails, mark the optimistic placeholder `failed: true`
 *     and keep it until the user retries or dismisses it.
 */
export function useOptimisticChat({ baseMessages }: UseOptimisticChatParams) {
  const [localMessages, setLocalMessages] = useState<OptimisticChatMessage[]>([]);
  const queryClient = useQueryClient();

  // Track persisted message ids to skip duplicates when echoes arrive.
  const persistedIdsRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    persistedIdsRef.current = new Set(baseMessages.map((m) => m.id));
  }, [baseMessages]);

  const appendOptimistic = useCallback((draft: OptimisticChatMessage) => {
    setLocalMessages((prev) => [...prev, draft]);
  }, []);

  const markFailed = useCallback((tempId: string) => {
    setLocalMessages((prev) => prev.map((m) => (m.tempId === tempId ? { ...m, failed: true } : m)));
  }, []);

  const removeByTempId = useCallback((tempId: string) => {
    setLocalMessages((prev) => prev.filter((m) => m.tempId !== tempId));
  }, []);

  /**
   * Reconcile an authoritative server message. Drops any matching
   * optimistic placeholder so the persisted version takes its place in
   * the rendered list.
   *
   * Match precedence:
   *   1. If both placeholder and echo carry a tempId, match exactly.
   *      This is the precise path used for the sender's own echoes.
   *   2. Otherwise fall back to user+body match. Covers echoes that
   *      lack a tempId (e.g., a peer's broadcast carrying no client
   *      hint), at the cost of dropping a legitimate duplicate send
   *      from the same user before its own echo arrives — acceptable
   *      because that path requires the user to send the same body
   *      twice within the inter-echo window.
   *
   * Failed placeholders are always preserved so the user can retry.
   */
  const reconcileEcho = useCallback((server: ChatMessageDto) => {
    setLocalMessages((prev) =>
      prev.filter((m) => {
        if (!m.tempId) return true;
        if (m.failed) return true;
        if (server.tempId && server.tempId === m.tempId) return false;
        if (server.tempId) return true;
        if (m.user.id !== server.user.id) return true;
        if (m.body !== server.body) return true;
        return false;
      })
    );
  }, []);

  /**
   * Add a message broadcast over Pusher. The infinite query is the
   * source of truth for history, but live messages append here so the
   * UI updates instantly without a refetch. Duplicate ids (e.g., the
   * user's own send arriving back) are ignored.
   */
  const [liveMessages, setLiveMessages] = useState<ChatMessageDto[]>([]);
  const addReceivedMessage = useCallback(
    (message: ChatMessageDto) => {
      reconcileEcho(message);
      // Strip the client-supplied `tempId` before storing the echo:
      // it was only useful to match this server message against the
      // sender's optimistic placeholder. Leaving it on the persisted
      // copy makes `isPending` (which is driven off `tempId`) true
      // forever, so the row renders grayed-out with a spinner.
      const persisted: ChatMessageDto = { ...message };
      delete persisted.tempId;
      setLiveMessages((prev) => {
        if (persistedIdsRef.current.has(persisted.id)) return prev;
        if (prev.some((m) => m.id === persisted.id)) return prev;
        return [...prev, persisted];
      });
    },
    [reconcileEcho]
  );

  /**
   * Update a live or persisted message in place (e.g., reaction toggle
   * echo). Patches both the in-memory live list and the infinite-query
   * cache so messages from history reflect the new reactions without
   * waiting for a refetch.
   */
  const updateMessage = useCallback(
    (updated: ChatMessageDto) => {
      setLiveMessages((prev) => prev.map((m) => (m.id === updated.id ? updated : m)));
      queryClient.setQueryData<ChatMessagesInfiniteData>(queryKeys.chat.messages(), (data) => {
        if (!data) return data;
        let changed = false;
        const pages = data.pages.map((page) => {
          if (!page.messages.some((m) => m.id === updated.id)) return page;
          changed = true;
          return {
            ...page,
            messages: page.messages.map((m) => (m.id === updated.id ? { ...m, ...updated } : m)),
          };
        });
        return changed ? { ...data, pages } : data;
      });
    },
    [queryClient]
  );

  /**
   * Drop a message from every layer (live, local, and the persisted
   * infinite-query cache). Used when an admin deletes a message and
   * the `messageDeleted` broadcast lands.
   */
  const removeMessage = useCallback(
    (messageId: string) => {
      setLiveMessages((prev) => prev.filter((m) => m.id !== messageId));
      setLocalMessages((prev) => prev.filter((m) => m.id !== messageId));
      queryClient.setQueryData<ChatMessagesInfiniteData>(queryKeys.chat.messages(), (data) => {
        if (!data) return data;
        let changed = false;
        const pages = data.pages.map((page) => {
          if (!page.messages.some((m) => m.id === messageId)) return page;
          changed = true;
          return { ...page, messages: page.messages.filter((m) => m.id !== messageId) };
        });
        return changed ? { ...data, pages } : data;
      });
    },
    [queryClient]
  );

  const messages = useMemo<OptimisticChatMessage[]>(
    () => [...baseMessages, ...liveMessages, ...localMessages],
    [baseMessages, liveMessages, localMessages]
  );

  return {
    messages,
    appendOptimistic,
    markFailed,
    removeByTempId,
    addReceivedMessage,
    updateMessage,
    removeMessage,
  };
}
