/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use client';

import { useCallback, useLayoutEffect, useRef } from 'react';

import type { OptimisticChatMessage } from '@/hooks/use-optimistic-chat';

import { ChatLoadMoreButton } from './chat-load-more-button';
import { ChatMessageRow } from './chat-message-row';

interface ChatMessageListProps {
  messages: OptimisticChatMessage[];
  hasNextPage: boolean;
  isFetchingNextPage: boolean;
  onLoadMore: () => void;
  renderReactionBar?: (message: OptimisticChatMessage) => React.ReactNode;
  /**
   * When set, the list scrolls to the most recent message containing
   * `@<scrollToMentionUsername>` instead of anchoring to the bottom on
   * first paint. Used for the mention-email deep link.
   */
  scrollToMentionUsername?: string | null;
}

const SCROLL_BOTTOM_THRESHOLD_PX = 50;

/**
 * Scrollable message list. Anchors to the bottom on first paint and on
 * new tail messages when the user was already at the bottom; preserves
 * the user's viewport on prepend (Load more) by adjusting scrollTop by
 * the height delta. Auto-scroll is suppressed when the user has
 * deliberately scrolled up to read history.
 */
export const ChatMessageList = ({
  messages,
  hasNextPage,
  isFetchingNextPage,
  onLoadMore,
  renderReactionBar,
  scrollToMentionUsername,
}: ChatMessageListProps) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const prevFirstIdRef = useRef<string | undefined>(undefined);
  const prevLastIdRef = useRef<string | undefined>(undefined);
  const prevScrollHeightRef = useRef(0);
  const wasAtBottomRef = useRef(true);
  const mentionScrollDoneRef = useRef(false);

  const handleScroll = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    const distance = el.scrollHeight - el.scrollTop - el.clientHeight;
    wasAtBottomRef.current = distance < SCROLL_BOTTOM_THRESHOLD_PX;
  }, []);

  useLayoutEffect(() => {
    const el = containerRef.current;
    if (!el || messages.length === 0) return;

    const newScrollHeight = el.scrollHeight;
    const firstId = messages[0]?.id;
    const lastId = messages[messages.length - 1]?.id;
    const prevFirstId = prevFirstIdRef.current;
    const prevLastId = prevLastIdRef.current;

    const isFirstPaint = prevFirstId === undefined && prevLastId === undefined;
    const isPrepend = !isFirstPaint && firstId !== prevFirstId;
    const isAppend = !isFirstPaint && lastId !== prevLastId && firstId === prevFirstId;

    // Mention deep-link: on the first paint after messages load, anchor
    // to the most recent mention of the viewer's username instead of the
    // bottom. Falls back to bottom if no matching mention is found.
    const targetUsername = scrollToMentionUsername?.toLowerCase();
    if (isFirstPaint && targetUsername && !mentionScrollDoneRef.current) {
      const nodes = el.querySelectorAll<HTMLElement>(
        `[data-mention-username="${CSS.escape(targetUsername)}"]`
      );
      const lastMention = nodes.length > 0 ? nodes[nodes.length - 1] : null;
      mentionScrollDoneRef.current = true;
      if (lastMention) {
        lastMention.scrollIntoView({ block: 'center' });
        prevFirstIdRef.current = firstId;
        prevLastIdRef.current = lastId;
        prevScrollHeightRef.current = newScrollHeight;
        return;
      }
    }

    if (isFirstPaint) {
      el.scrollTop = el.scrollHeight;
    } else if (isPrepend) {
      const heightDelta = newScrollHeight - prevScrollHeightRef.current;
      el.scrollTop = el.scrollTop + heightDelta;
    } else if (isAppend && wasAtBottomRef.current) {
      el.scrollTop = el.scrollHeight;
    }

    prevFirstIdRef.current = firstId;
    prevLastIdRef.current = lastId;
    prevScrollHeightRef.current = newScrollHeight;
  }, [messages, scrollToMentionUsername]);

  return (
    <div
      ref={containerRef}
      onScroll={handleScroll}
      className="flex flex-1 flex-col overflow-y-auto"
      style={{ touchAction: 'pan-y' }}
      data-testid="chat-message-list"
    >
      {hasNextPage && <ChatLoadMoreButton onLoadMore={onLoadMore} isLoading={isFetchingNextPage} />}
      {messages.length === 0 ? (
        <div className="text-muted-foreground flex flex-1 items-center justify-center p-8 text-sm">
          No messages yet — say hi 👋
        </div>
      ) : (
        <ul className="divide-y">
          {messages.map((message) => (
            <li key={message.tempId ?? message.id}>
              <ChatMessageRow message={message} reactionBar={renderReactionBar?.(message)} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};
