/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use client';

import { useCallback, useMemo, useState } from 'react';

import { type QueryClient, useQueryClient } from '@tanstack/react-query';
import md5 from 'crypto-js/md5';
import { Loader2 } from 'lucide-react';
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
import { ChatInput } from './chat-input';
import { ChatMessagePinIndicator, ChatMessageReactionBar } from './chat-message-action-buttons';
import { ChatMessageList } from './chat-message-list';
import { ChatReportAbusePopover } from './chat-report-abuse-popover';
import { ChatTypingIndicator } from './chat-typing-indicator';

import type { Session } from 'next-auth';

interface SessionUser {
  id: string;
  username: string | null;
  email: string;
  role: string | null;
}

const extractSessionUser = (session: Session): SessionUser => {
  const user = session.user as
    | { id?: string; name?: string | null; email?: string | null; role?: string | null }
    | undefined;
  return {
    id: user?.id ?? '',
    username: user?.name ?? null,
    email: user?.email ?? '',
    role: user?.role ?? null,
  };
};

const getIsBlocked = (meStatus: { blocked?: boolean } | undefined): boolean =>
  meStatus !== undefined && meStatus.blocked === true;

const applyPinChangeToCache = (
  updated: ChatMessageDto,
  updateMessage: (msg: ChatMessageDto) => void,
  queryClient: QueryClient
): void => {
  updateMessage(updated);
  queryClient.setQueryData<ChatMessageDto[]>(queryKeys.chat.pinned(), (prev) => {
    const list = prev ?? [];
    const without = list.filter((m) => m.id !== updated.id);
    if (!updated.pinnedAt) return without;
    return [updated, ...without];
  });
};

const toastReactionError = (error: string): void => {
  switch (error) {
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
};

const toastPinError = (error: string, limit?: number): void => {
  if (error === 'limit_reached') {
    toast.error(
      `You can only pin ${limit ?? 3} messages at a time. Unpin one before pinning another.`
    );
  } else if (error === 'unauthorized') {
    toast.error('Please sign in to pin messages.');
  } else if (error === 'forbidden') {
    toast.error('Only moderators can pin messages.');
  } else if (error === 'not_found') {
    toast.error('Message no longer exists.');
  } else {
    toast.error('Could not update pin.');
  }
};

const toastDeleteError = (error: string): void => {
  if (error === 'unauthorized') {
    toast.error('Please sign in to delete messages.');
  } else if (error === 'forbidden') {
    toast.error('Only moderators can delete messages.');
  } else if (error === 'not_found') {
    toast.error('Message no longer exists.');
  } else {
    toast.error('Could not delete message.');
  }
};

interface PendingDelete {
  messageId: string;
  authorUsername: string | null;
}

const confirmDelete = async (
  scope: DeleteChatMessageScope,
  target: PendingDelete | null,
  removeMessage: (id: string) => void
): Promise<boolean> => {
  if (!target) return true;
  if (scope === 'message') {
    removeMessage(target.messageId);
  }
  const result = await deleteChatMessageAction({ messageId: target.messageId, scope });
  if (!result.success) {
    toastDeleteError(result.error);
    return false;
  }
  if (scope === 'user') {
    for (const id of result.deletedIds) removeMessage(id);
  }
  return true;
};

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
  const isBlocked = getIsBlocked(meStatus);
  const enabledWithAccess = enabled && !isBlocked;
  const {
    messages: baseMessages,
    isPending,
    isError,
    hasNextPage,
    isFetchingNextPage,
    fetchNextPage,
  } = useInfiniteChatMessagesQuery({ enabled: enabledWithAccess });

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
    enabled: enabledWithAccess,
  });

  // Applies a pin/unpin broadcast to both caches (infinite list + pinned strip).
  const applyPinChange = useCallback(
    (updated: ChatMessageDto) => applyPinChangeToCache(updated, updateMessage, queryClient),
    [queryClient, updateMessage]
  );

  const { id: currentUserId, username, role, email } = extractSessionUser(session);
  const { activeTypers, noteTyping } = useChatTyping(currentUserId);

  const { sendTyping } = useChatChannel({
    enabled,
    onNewMessage: addReceivedMessage,
    onReactionUpdated: updateMessage,
    onMessageDeleted: ({ messageId }) => removeMessage(messageId),
    onMessagePinChanged: applyPinChange,
    onTyping: noteTyping,
  });

  const isAdmin = role === 'admin';

  const currentUser = useMemo(
    () => ({
      id: currentUserId,
      username,
      gravatarHash: email ? md5(email.trim().toLowerCase()).toString() : '',
      role,
    }),
    [currentUserId, username, email, role]
  );

  const handleSendTyping = useCallback(() => {
    sendTyping({ userId: currentUserId, username });
  }, [sendTyping, currentUserId, username]);

  const handleToggleReaction = useCallback(
    async (messageId: string, emoji: string) => {
      const result = await toggleChatReactionAction({ messageId, emoji });
      if (!result.success) {
        toastReactionError(result.error);
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
        toastPinError(result.error, result.limit);
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
      // confirmDelete applies optimistic removal, calls the action, and
      // handles any scoped bulk-removal on success (scope === 'user').
      await confirmDelete(scope, target, removeMessage);
    },
    [pendingDelete, removeMessage]
  );

  const handleRequestDelete = useCallback(
    (messageId: string, authorUsername: string | null) =>
      setPendingDelete({ messageId, authorUsername }),
    []
  );

  const renderReactionBar = useCallback(
    (message: OptimisticChatMessage) => (
      <ChatMessageReactionBar
        message={message}
        currentUserId={currentUserId}
        isAdmin={isAdmin}
        onToggleReaction={(id, emoji) => void handleToggleReaction(id, emoji)}
        onRequestDelete={handleRequestDelete}
        onTogglePin={(id) => void handleTogglePin(id)}
      />
    ),
    [currentUserId, isAdmin, handleToggleReaction, handleRequestDelete, handleTogglePin]
  );

  const renderPinIndicator = useCallback(
    (message: OptimisticChatMessage) => (
      <ChatMessagePinIndicator
        message={message}
        isAdmin={isAdmin}
        onTogglePin={(id) => void handleTogglePin(id)}
      />
    ),
    [isAdmin, handleTogglePin]
  );

  const scrollToMentionUsername = scrollToMention ? username : null;
  const pendingDeleteUsername = pendingDelete ? pendingDelete.authorUsername : null;

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
        scrollToMentionUsername={scrollToMentionUsername}
      />
      <ChatTypingIndicator typers={activeTypers} />
      <ChatDeleteMessageDialog
        open={pendingDelete !== null}
        onOpenChange={(open) => {
          if (!open) setPendingDelete(null);
        }}
        authorUsername={pendingDeleteUsername}
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
