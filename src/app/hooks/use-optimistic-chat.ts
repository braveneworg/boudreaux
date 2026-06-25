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
 * Pure filter predicate for reconciling an optimistic placeholder against a
 * server echo. Returns `true` to keep the placeholder, `false` to drop it.
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
const keepPlaceholder = (m: OptimisticChatMessage, server: ChatMessageDto): boolean => {
  if (!m.tempId) return true;
  if (m.failed) return true;
  if (server.tempId && server.tempId === m.tempId) return false;
  if (server.tempId) return true;
  if (m.user.id !== server.user.id) return true;
  if (m.body !== server.body) return true;
  return false;
};

/**
 * Builds the `setLiveMessages` updater for `addReceivedMessage`. Skips the
 * message when it is already present in the persisted set or the live list.
 */
const buildLiveAppender =
  (persisted: ChatMessageDto, persistedIds: Set<string>) =>
  (prev: ChatMessageDto[]): ChatMessageDto[] => {
    if (persistedIds.has(persisted.id)) return prev;
    if (prev.some((m) => m.id === persisted.id)) return prev;
    return [...prev, persisted];
  };

/**
 * Builds the `setQueryData` updater that patches a single message inside the
 * infinite-query page cache. Returns the same reference when nothing changed.
 */
const buildCacheUpdater =
  (updated: ChatMessageDto) =>
  (data: ChatMessagesInfiniteData | undefined): ChatMessagesInfiniteData | undefined => {
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
  };

/**
 * Builds the `setQueryData` updater that removes a message from the
 * infinite-query page cache. Returns the same reference when nothing changed.
 */
const buildCacheRemover =
  (messageId: string) =>
  (data: ChatMessagesInfiniteData | undefined): ChatMessagesInfiniteData | undefined => {
    if (!data) return data;
    let changed = false;
    const pages = data.pages.map((page) => {
      if (!page.messages.some((m) => m.id === messageId)) return page;
      changed = true;
      return { ...page, messages: page.messages.filter((m) => m.id !== messageId) };
    });
    return changed ? { ...data, pages } : data;
  };

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
export const useOptimisticChat = ({
  baseMessages,
}: UseOptimisticChatParams): {
  messages: OptimisticChatMessage[];
  appendOptimistic: (draft: OptimisticChatMessage) => void;
  markFailed: (tempId: string) => void;
  removeByTempId: (tempId: string) => void;
  addReceivedMessage: (message: ChatMessageDto) => void;
  updateMessage: (updated: ChatMessageDto) => void;
  removeMessage: (messageId: string) => void;
} => {
  const [localMessages, setLocalMessages] = useState<OptimisticChatMessage[]>([]);
  const [liveMessages, setLiveMessages] = useState<ChatMessageDto[]>([]);
  const queryClient = useQueryClient();

  // Track persisted message ids to skip duplicates when echoes arrive.
  const persistedIdsRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    persistedIdsRef.current = new Set(baseMessages.map((m) => m.id));
  }, [baseMessages]);

  const appendOptimistic = useCallback((draft: OptimisticChatMessage): void => {
    setLocalMessages((prev) => [...prev, draft]);
  }, []);

  const markFailed = useCallback((tempId: string): void => {
    setLocalMessages((prev) => prev.map((m) => (m.tempId === tempId ? { ...m, failed: true } : m)));
  }, []);

  const removeByTempId = useCallback((tempId: string): void => {
    setLocalMessages((prev) => prev.filter((m) => m.tempId !== tempId));
  }, []);

  const reconcileEcho = useCallback((server: ChatMessageDto): void => {
    setLocalMessages((prev) => prev.filter((m) => keepPlaceholder(m, server)));
  }, []);

  /**
   * Add a message broadcast over Pusher. The infinite query is the
   * source of truth for history, but live messages append here so the
   * UI updates instantly without a refetch. Duplicate ids (e.g., the
   * user's own send arriving back) are ignored.
   */
  const addReceivedMessage = useCallback(
    (message: ChatMessageDto): void => {
      reconcileEcho(message);
      // Strip the client-supplied `tempId` before storing the echo:
      // it was only useful to match this server message against the
      // sender's optimistic placeholder. Leaving it on the persisted
      // copy makes `isPending` (which is driven off `tempId`) true
      // forever, so the row renders grayed-out with a spinner.
      const persisted: ChatMessageDto = { ...message };
      delete persisted.tempId;
      setLiveMessages(buildLiveAppender(persisted, persistedIdsRef.current));
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
    (updated: ChatMessageDto): void => {
      setLiveMessages((prev) => prev.map((m) => (m.id === updated.id ? updated : m)));
      queryClient.setQueryData<ChatMessagesInfiniteData>(
        queryKeys.chat.messages(),
        buildCacheUpdater(updated)
      );
    },
    [queryClient]
  );

  /**
   * Drop a message from every layer (live, local, and the persisted
   * infinite-query cache). Used when an admin deletes a message and
   * the `messageDeleted` broadcast lands.
   */
  const removeMessage = useCallback(
    (messageId: string): void => {
      setLiveMessages((prev) => prev.filter((m) => m.id !== messageId));
      setLocalMessages((prev) => prev.filter((m) => m.id !== messageId));
      queryClient.setQueryData<ChatMessagesInfiniteData>(
        queryKeys.chat.messages(),
        buildCacheRemover(messageId)
      );
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
};
