/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use client';

import { useCallback, useMemo, useState } from 'react';

import { useQueryClient } from '@tanstack/react-query';
import md5 from 'crypto-js/md5';
import { Loader2, Pin, SmilePlus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';

import { useChatChannel } from '@/hooks/use-chat-channel';
import { useChatMeQuery } from '@/hooks/use-chat-me-query';
import { useChatPinnedMessagesQuery } from '@/hooks/use-chat-pinned-messages-query';
import { useChatTyping } from '@/hooks/use-chat-typing';
import { useFingerprint } from '@/hooks/use-fingerprint';
import { useInfiniteChatMessagesQuery } from '@/hooks/use-infinite-chat-messages-query';
import { useOptimisticChat, type OptimisticChatMessage } from '@/hooks/use-optimistic-chat';
import {
  deleteChatMessageAction,
  type DeleteChatMessageScope,
} from '@/lib/actions/delete-chat-message-action';
import { toggleChatReactionAction } from '@/lib/actions/toggle-chat-reaction-action';
import { togglePinChatMessageAction } from '@/lib/actions/toggle-pin-chat-message-action';
import { queryKeys } from '@/lib/query-keys';
import type { ChatMessageDto } from '@/lib/services/chat-service';

import { ChatDeleteMessageDialog } from './chat-delete-message-dialog';
import { ChatDisabledState } from './chat-disabled-state';
import { ChatEmojiPicker } from './chat-emoji-picker';
import { ChatInput } from './chat-input';
import { ChatMessageList } from './chat-message-list';
import { ChatReactionBar } from './chat-reaction-bar';
import { ChatReportAbusePopover } from './chat-report-abuse-popover';
import { ChatTypingIndicator } from './chat-typing-indicator';

import type { Session } from 'next-auth';

interface ChatBodyProps {
  session: Session;
  /** When false, defers the network/Pusher/fingerprint work until the drawer is open. */
  enabled: boolean;
  /**
   * When true (mention deep-link), the message list anchors to the
   * latest mention of the current user's username instead of the bottom.
   */
  scrollToMention?: boolean;
}

export const ChatBody = ({ session, enabled, scrollToMention = false }: ChatBodyProps) => {
  const { fingerprint } = useFingerprint();
  const { data: meStatus } = useChatMeQuery({ enabled });
  const isBlocked = meStatus?.blocked ?? false;
  const {
    messages: baseMessages,
    isPending,
    isError,
    hasNextPage,
    isFetchingNextPage,
    fetchNextPage,
  } = useInfiniteChatMessagesQuery({ enabled: enabled && !isBlocked });

  const {
    messages,
    appendOptimistic,
    markFailed,
    addReceivedMessage,
    updateMessage,
    removeMessage,
  } = useOptimisticChat({ baseMessages });

  const queryClient = useQueryClient();
  const { data: pinnedMessages = [] } = useChatPinnedMessagesQuery({
    enabled: enabled && !isBlocked,
  });

  /**
   * Apply a pin/unpin event to both caches: patch `pinnedAt` on the row
   * in the messages infinite query AND add/remove it from the pinned
   * strip cache. Runs for the actor (after a successful action call) and
   * for everyone else (via the `messagePinChanged` Pusher broadcast).
   */
  const applyPinChange = useCallback(
    (updated: ChatMessageDto) => {
      updateMessage(updated);
      queryClient.setQueryData<ChatMessageDto[]>(queryKeys.chat.pinned(), (prev) => {
        const list = prev ?? [];
        const without = list.filter((m) => m.id !== updated.id);
        if (!updated.pinnedAt) return without;
        return [updated, ...without];
      });
    },
    [queryClient, updateMessage]
  );

  const currentUserId = session.user?.id ?? '';
  const { activeTypers, noteTyping } = useChatTyping(currentUserId);

  const { sendTyping } = useChatChannel({
    enabled,
    onNewMessage: addReceivedMessage,
    onReactionUpdated: updateMessage,
    onMessageDeleted: ({ messageId }) => removeMessage(messageId),
    onMessagePinChanged: applyPinChange,
    onTyping: noteTyping,
  });

  const isAdmin = (session.user as { role?: string | null })?.role === 'admin';

  const currentUser = useMemo(() => {
    const email = session.user?.email ?? '';
    return {
      id: currentUserId,
      username: session.user?.name ?? null,
      gravatarHash: email ? md5(email.trim().toLowerCase()).toString() : '',
      role: (session.user as { role?: string | null })?.role ?? null,
    };
  }, [currentUserId, session.user]);

  const handleSendTyping = useCallback(() => {
    sendTyping({ userId: currentUserId, username: session.user?.name ?? null });
  }, [sendTyping, currentUserId, session.user?.name]);

  const handleToggleReaction = useCallback(
    async (messageId: string, emoji: string) => {
      const result = await toggleChatReactionAction({ messageId, emoji });
      if (!result.success) {
        switch (result.error) {
          case 'disabled':
            toast.error('Chat access has been disabled for your account.');
            break;
          case 'unauthorized':
            toast.error('Please sign in to react.');
            break;
          case 'not_found':
            toast.error('Message no longer exists.');
            break;
          default:
            toast.error('Could not update reaction.');
        }
        return;
      }
      // The Pusher broadcast will land via onReactionUpdated; apply
      // immediately as well so the toggling user sees instant feedback.
      updateMessage(result.data);
    },
    [updateMessage]
  );

  const handleTogglePin = useCallback(
    async (messageId: string) => {
      const result = await togglePinChatMessageAction({ messageId });
      if (!result.success) {
        if (result.error === 'limit_reached') {
          const limit = result.limit ?? 3;
          toast.error(
            `You can only pin ${limit} messages at a time. Unpin one before pinning another.`
          );
        } else if (result.error === 'unauthorized') {
          toast.error('Please sign in to pin messages.');
        } else if (result.error === 'forbidden') {
          toast.error('Only moderators can pin messages.');
        } else if (result.error === 'not_found') {
          toast.error('Message no longer exists.');
        } else {
          toast.error('Could not update pin.');
        }
        return;
      }
      applyPinChange(result.data);
    },
    [applyPinChange]
  );

  const [pendingDelete, setPendingDelete] = useState<{
    messageId: string;
    authorUsername: string | null;
  } | null>(null);

  const handleDeleteConfirmed = useCallback(
    async (scope: DeleteChatMessageScope) => {
      const target = pendingDelete;
      setPendingDelete(null);
      if (!target) return;

      if (scope === 'message') {
        removeMessage(target.messageId);
      }

      const result = await deleteChatMessageAction({ messageId: target.messageId, scope });
      if (!result.success) {
        if (result.error === 'unauthorized') {
          toast.error('Please sign in to delete messages.');
        } else if (result.error === 'forbidden') {
          toast.error('Only moderators can delete messages.');
        } else if (result.error === 'not_found') {
          toast.error('Message no longer exists.');
        } else {
          toast.error('Could not delete message.');
        }
        return;
      }

      // For scope: 'user' we apply locally on success — the action returns
      // every id that was hidden. Pusher echoes will arrive shortly after
      // and `removeMessage` is idempotent.
      if (scope === 'user') {
        for (const id of result.deletedIds) removeMessage(id);
      }
    },
    [pendingDelete, removeMessage]
  );

  const renderReactionBar = useCallback(
    (message: OptimisticChatMessage) => {
      if (message.tempId) return null; // no reactions on unsaved messages
      return (
        <>
          <ChatReactionBar
            reactions={message.reactions}
            currentUserId={currentUserId}
            onToggle={(emoji) => void handleToggleReaction(message.id, emoji)}
          />
          <ChatEmojiPicker
            trigger={
              <button
                type="button"
                aria-label="Add reaction"
                className="text-muted-foreground hover:text-foreground inline-flex items-center justify-center rounded-md p-1 transition-colors"
              >
                <SmilePlus aria-hidden="true" className="size-4" />
              </button>
            }
            onSelect={(emoji) => void handleToggleReaction(message.id, emoji)}
          />
          {isAdmin && (
            <button
              type="button"
              aria-label="Delete message"
              data-testid="chat-delete-message"
              onClick={() =>
                setPendingDelete({
                  messageId: message.id,
                  authorUsername: message.user.username,
                })
              }
              className="text-muted-foreground hover:text-destructive inline-flex items-center justify-center rounded-md p-1 transition-colors"
            >
              <Trash2 aria-hidden="true" className="size-4" />
            </button>
          )}
          {isAdmin && message.user.role === 'admin' && !message.pinnedAt && (
            <button
              type="button"
              aria-label="Pin message"
              data-testid="chat-pin-message"
              onClick={() => void handleTogglePin(message.id)}
              className="text-muted-foreground hover:text-foreground inline-flex items-center justify-center rounded-md p-1 transition-colors"
            >
              <Pin aria-hidden="true" className="size-4" />
            </button>
          )}
        </>
      );
    },
    [currentUserId, handleToggleReaction, isAdmin, handleTogglePin]
  );

  const renderPinIndicator = useCallback(
    (message: OptimisticChatMessage) => {
      // Admins get an interactive unpin button; everyone else sees the
      // red pin glyph as a non-interactive marker so it's still clear the
      // row is pinned.
      if (isAdmin) {
        return (
          <button
            type="button"
            aria-label="Unpin message"
            data-testid="chat-unpin-message"
            onClick={() => void handleTogglePin(message.id)}
            className="inline-flex items-center justify-center rounded-md p-1 text-red-600 transition-colors hover:bg-red-50"
          >
            <Pin aria-hidden="true" className="size-4 fill-current" />
          </button>
        );
      }
      return (
        <span
          aria-label="Pinned message"
          className="inline-flex items-center justify-center p-1 text-red-600"
        >
          <Pin aria-hidden="true" className="size-4 fill-current" />
        </span>
      );
    },
    [isAdmin, handleTogglePin]
  );

  if (isBlocked) {
    return <ChatDisabledState />;
  }

  if (isPending) {
    return (
      <div className="flex flex-1 items-center justify-center p-8">
        <Loader2
          aria-label="Loading messages"
          className="text-muted-foreground size-6 animate-spin"
        />
      </div>
    );
  }

  if (isError) {
    return (
      <div className="text-destructive flex flex-1 items-center justify-center p-8 text-sm">
        Could not load chat messages.
      </div>
    );
  }

  return (
    <>
      <ChatReportAbusePopover />
      <ChatMessageList
        messages={messages}
        pinnedMessages={pinnedMessages}
        hasNextPage={hasNextPage}
        isFetchingNextPage={isFetchingNextPage}
        onLoadMore={() => void fetchNextPage()}
        renderReactionBar={renderReactionBar}
        renderPinIndicator={renderPinIndicator}
        scrollToMentionUsername={scrollToMention ? (session.user?.name ?? null) : null}
      />
      <ChatTypingIndicator typers={activeTypers} />
      <ChatDeleteMessageDialog
        open={pendingDelete !== null}
        onOpenChange={(open) => {
          if (!open) setPendingDelete(null);
        }}
        authorUsername={pendingDelete?.authorUsername ?? null}
        onConfirm={(scope) => void handleDeleteConfirmed(scope)}
      />
      <ChatInput
        fingerprint={fingerprint}
        currentUser={currentUser}
        onOptimisticAppend={appendOptimistic}
        // addReceivedMessage handles both: it inserts the persisted DTO
        // into the live list AND reconciles the matching optimistic
        // placeholder via tempId. Works whether or not Pusher echoes.
        onSendResolved={(_tempId, server) => addReceivedMessage(server)}
        onSendFailed={markFailed}
        onTyping={handleSendTyping}
      />
    </>
  );
};
