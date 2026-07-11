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
const MemoizedMessageRow = memo(
  ({
    message,
    align,
    renderReactionBar,
    renderPinIndicator,
  }: {
    message: OptimisticChatMessage;
    align?: 'left' | 'right';
    renderReactionBar?: (message: OptimisticChatMessage) => React.ReactNode;
    renderPinIndicator?: (message: OptimisticChatMessage) => React.ReactNode;
  }) => (
    <ChatMessageRow
      message={message}
      align={align}
      reactionBar={renderReactionBar?.(message)}
      pinIndicator={renderPinIndicator?.(message)}
    />
  )
);

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

interface ScrollFlags {
  firstId: string | undefined;
  lastId: string | undefined;
  isFirstPaint: boolean;
  isPrepend: boolean;
  isAppend: boolean;
}

/**
 * Classify how the message array changed since the previous paint so the
 * effect can decide whether to anchor to the bottom (first paint / tail
 * append) or preserve the viewport (prepend on "Load more").
 */
const computeScrollFlags = (
  messages: OptimisticChatMessage[],
  prevFirstId: string | undefined,
  prevLastId: string | undefined
): ScrollFlags => {
  const firstId = messages[0]?.id;
  const lastId = messages[messages.length - 1]?.id;
  const isFirstPaint = prevFirstId === undefined && prevLastId === undefined;
  const isPrepend = !isFirstPaint && firstId !== prevFirstId;
  const isAppend = !isFirstPaint && lastId !== prevLastId && firstId === prevFirstId;
  return { firstId, lastId, isFirstPaint, isPrepend, isAppend };
};

/**
 * On first paint, find the last DOM node mentioning the viewer's username so
 * the list can deep-link to it instead of anchoring to the bottom. Returns
 * null when there's nothing to anchor to (not first paint, no target, already
 * resolved, or no matching node).
 */
const findMentionScrollTarget = (
  el: HTMLElement,
  targetUsername: string | undefined,
  isFirstPaint: boolean,
  alreadyDone: boolean
): HTMLElement | null => {
  if (!isFirstPaint || !targetUsername || alreadyDone) return null;
  const nodes = el.querySelectorAll<HTMLElement>(
    `[data-mention-username="${CSS.escape(targetUsername)}"]`
  );
  return nodes.length > 0 ? nodes[nodes.length - 1] : null;
};

interface ScrollAnchorState {
  el: HTMLElement;
  flags: ScrollFlags;
  wasAtBottom: boolean;
  prevScrollHeight: number;
  newScrollHeight: number;
}

/** Apply the resolved scroll position for the current update. */
const applyScrollAnchor = ({
  el,
  flags,
  wasAtBottom,
  prevScrollHeight,
  newScrollHeight,
}: ScrollAnchorState): void => {
  if (flags.isFirstPaint) {
    el.scrollTop = el.scrollHeight;
  } else if (flags.isPrepend) {
    el.scrollTop = el.scrollTop + (newScrollHeight - prevScrollHeight);
  } else if (flags.isAppend && wasAtBottom) {
    el.scrollTop = el.scrollHeight;
  }
};

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
  const streamRef = useRef<HTMLUListElement>(null);
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
    const flags = computeScrollFlags(messages, prevFirstIdRef.current, prevLastIdRef.current);

    const commitRefs = (): void => {
      prevFirstIdRef.current = flags.firstId;
      prevLastIdRef.current = flags.lastId;
      prevScrollHeightRef.current = newScrollHeight;
    };

    // Mention deep-link: on the first paint after messages load, anchor
    // to the most recent mention of the viewer's username instead of the
    // bottom. Falls back to bottom if no matching mention is found.
    const targetUsername = scrollToMentionUsername?.toLowerCase();
    if (flags.isFirstPaint && targetUsername && !mentionScrollDoneRef.current) {
      const lastMention = findMentionScrollTarget(el, targetUsername, flags.isFirstPaint, false);
      mentionScrollDoneRef.current = true;
      if (lastMention) {
        lastMention.scrollIntoView({ block: 'center' });
        commitRefs();
        return;
      }
    }

    applyScrollAnchor({
      el,
      flags,
      wasAtBottom: wasAtBottomRef.current,
      prevScrollHeight: prevScrollHeightRef.current,
      newScrollHeight,
    });
    commitRefs();
  }, [messages, scrollToMentionUsername]);

  // Filter out pinned messages and pre-compute per-row alignment once per
  // messages/pins change instead of on every render. Consecutive messages by
  // the same author share a group; alignment flips each time the author
  // changes so adjacent users' headers sit on opposite sides.
  const visibleRows = useMemo(() => {
    const visibleMessages =
      pinnedById.size > 0 ? messages.filter((m) => !pinnedById.has(m.id)) : messages;
    let groupIndex = 0;
    let prevUserId: string | undefined;
    return visibleMessages.map((message) => {
      if (prevUserId !== undefined && message.user.id !== prevUserId) {
        groupIndex += 1;
      }
      prevUserId = message.user.id;
      const align: 'left' | 'right' = groupIndex % 2 === 0 ? 'left' : 'right';
      return { message, align };
    });
  }, [messages, pinnedById]);

  // Late layout shifts land AFTER the one-shot first-paint anchor above:
  // iOS Safari's URL-bar collapse changes the drawer's dvh height, the
  // on-screen keyboard resizes the viewport, and avatar images grow rows
  // as they load. Re-pin to the bottom on any container/stream resize
  // until the viewer deliberately scrolls up (wasAtBottomRef flips false).
  const isEmpty = visibleRows.length === 0;
  useLayoutEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const observer = new ResizeObserver(() => {
      if (wasAtBottomRef.current) el.scrollTop = el.scrollHeight;
    });
    observer.observe(el);
    if (streamRef.current) observer.observe(streamRef.current);
    return () => observer.disconnect();
  }, [isEmpty]);

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
          className="sticky top-0 z-10 border-y border-zinc-500 bg-transparent shadow-[0_4px_12px_rgba(0,0,0,0.22)] backdrop-blur-sm"
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
      {visibleRows.length === 0 ? (
        <div className="text-muted-foreground flex flex-1 items-center justify-center p-8 text-sm">
          No messages yet — say hi 👋
        </div>
      ) : (
        <ul ref={streamRef} className="divide-y">
          {visibleRows.map(({ message, align }) => (
            <li key={message.tempId ?? message.id}>
              <MemoizedMessageRow
                message={message}
                align={align}
                renderReactionBar={renderReactionBar}
              />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};
