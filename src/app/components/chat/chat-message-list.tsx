/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use client';

import { memo, useCallback, useLayoutEffect, useMemo, useRef } from 'react';

import type { OptimisticChatMessage } from '@/hooks/use-optimistic-chat';

import { ChatLoadMoreButton } from './chat-load-more-button';
import { ChatMessageRow } from './chat-message-row';

/**
 * Memoized row wrapper. Render props are invoked inside the memo boundary so
 * a Pusher event that touches one message (new message, reaction, typing)
 * re-renders only that row instead of every visible row. This relies on two
 * stable identities: unchanged message objects keep their reference in
 * useOptimisticChat's updates, and the render props are useCallback-stable
 * in chat-body.
 */
const MemoizedMessageRow = memo(function MemoizedMessageRow({
  message,
  align,
  renderReactionBar,
  renderPinIndicator,
}: {
  message: OptimisticChatMessage;
  align?: 'left' | 'right';
  renderReactionBar?: (message: OptimisticChatMessage) => React.ReactNode;
  renderPinIndicator?: (message: OptimisticChatMessage) => React.ReactNode;
}) {
  return (
    <ChatMessageRow
      message={message}
      align={align}
      reactionBar={renderReactionBar?.(message)}
      pinIndicator={renderPinIndicator?.(message)}
    />
  );
});

interface ChatMessageListProps {
  messages: OptimisticChatMessage[];
  /**
   * Currently pinned messages (already capped at the per-channel limit
   * by the server). Rendered sticky at the top and filtered out of the
   * regular stream.
   */
  pinnedMessages?: OptimisticChatMessage[];
  hasNextPage: boolean;
  isFetchingNextPage: boolean;
  onLoadMore: () => void;
  renderReactionBar?: (message: OptimisticChatMessage) => React.ReactNode;
  /** Header badge rendered on rows inside the pinned strip (e.g., red pin button). */
  renderPinIndicator?: (message: OptimisticChatMessage) => React.ReactNode;
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
  pinnedMessages,
  hasNextPage,
  isFetchingNextPage,
  onLoadMore,
  renderReactionBar,
  renderPinIndicator,
  scrollToMentionUsername,
}: ChatMessageListProps) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const prevFirstIdRef = useRef<string | undefined>(undefined);
  const prevLastIdRef = useRef<string | undefined>(undefined);
  const prevScrollHeightRef = useRef(0);
  const wasAtBottomRef = useRef(true);
  const mentionScrollDoneRef = useRef(false);

  // Admin-pinned announcements (caller already enforces the 3-cap),
  // newest pin first. Filtered out of the regular stream so they only
  // render once, in the sticky strip at the top.
  const pinnedById = useMemo(
    () => new Set((pinnedMessages ?? []).map((m) => m.id)),
    [pinnedMessages]
  );

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
      {pinnedMessages && pinnedMessages.length > 0 && (
        <div
          data-testid="chat-pinned-messages"
          className="sticky top-0 z-10 border-y border-zinc-500 bg-transparent shadow-[0_4px_12px_rgba(0,0,0,0.22)] backdrop-blur"
        >
          <ul className="divide-y">
            {pinnedMessages.map((message) => (
              <li key={`pinned-${message.id}`}>
                <MemoizedMessageRow
                  message={message}
                  renderReactionBar={renderReactionBar}
                  renderPinIndicator={renderPinIndicator}
                />
              </li>
            ))}
          </ul>
        </div>
      )}
      {hasNextPage && <ChatLoadMoreButton onLoadMore={onLoadMore} isLoading={isFetchingNextPage} />}
      {(() => {
        const visibleMessages =
          pinnedById.size > 0 ? messages.filter((m) => !pinnedById.has(m.id)) : messages;
        if (visibleMessages.length === 0) {
          return (
            <div className="text-muted-foreground flex flex-1 items-center justify-center p-8 text-sm">
              No messages yet — say hi 👋
            </div>
          );
        }
        // Group consecutive messages by author so a single user's run
        // keeps a consistent header alignment; flip alignment each time
        // the author changes so adjacent users' headers sit on opposite
        // sides. Body text is always left-aligned (handled in the row).
        let groupIndex = 0;
        let prevUserId: string | undefined;
        const rows = visibleMessages.map((message) => {
          if (prevUserId !== undefined && message.user.id !== prevUserId) {
            groupIndex += 1;
          }
          prevUserId = message.user.id;
          const align: 'left' | 'right' = groupIndex % 2 === 0 ? 'left' : 'right';
          return { message, align };
        });
        return (
          <ul className="divide-y">
            {rows.map(({ message, align }) => (
              <li key={message.tempId ?? message.id}>
                <MemoizedMessageRow
                  message={message}
                  align={align}
                  renderReactionBar={renderReactionBar}
                />
              </li>
            ))}
          </ul>
        );
      })()}
    </div>
  );
};
