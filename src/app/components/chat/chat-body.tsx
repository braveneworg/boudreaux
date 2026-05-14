/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use client';

import { useCallback, useMemo } from 'react';

import md5 from 'crypto-js/md5';
import { Loader2, SmilePlus } from 'lucide-react';
import { toast } from 'sonner';

import { useChatChannel } from '@/hooks/use-chat-channel';
import { useChatMeQuery } from '@/hooks/use-chat-me-query';
import { useChatMessagesQuery } from '@/hooks/use-chat-messages-query';
import { useChatTyping } from '@/hooks/use-chat-typing';
import { useFingerprint } from '@/hooks/use-fingerprint';
import { useOptimisticChat, type OptimisticChatMessage } from '@/hooks/use-optimistic-chat';
import { toggleChatReactionAction } from '@/lib/actions/toggle-chat-reaction-action';

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
  } = useChatMessagesQuery({ enabled: enabled && !isBlocked });

  const { messages, appendOptimistic, markFailed, addReceivedMessage, updateMessage } =
    useOptimisticChat({ baseMessages });

  const currentUserId = session.user?.id ?? '';
  const { activeTypers, noteTyping } = useChatTyping(currentUserId);

  const { sendTyping } = useChatChannel({
    enabled,
    onNewMessage: addReceivedMessage,
    onReactionUpdated: updateMessage,
    onTyping: noteTyping,
  });

  const currentUser = useMemo(() => {
    const email = session.user?.email ?? '';
    return {
      id: currentUserId,
      username: session.user?.name ?? null,
      gravatarHash: email ? md5(email.trim().toLowerCase()).toString() : '',
    };
  }, [currentUserId, session.user?.email, session.user?.name]);

  const handleSendTyping = useCallback(() => {
    sendTyping({ userId: currentUserId, username: session.user?.name ?? null });
  }, [sendTyping, currentUserId, session.user?.name]);

  const handleToggleReaction = useCallback(
    async (messageId: string, emoji: string) => {
      const result = await toggleChatReactionAction({ messageId, emoji });
      if (!result.success) {
        if (result.error === 'disabled') {
          toast.error('Chat access has been disabled for your account.');
        } else if (result.error === 'unauthorized') {
          toast.error('Please sign in to react.');
        } else if (result.error === 'not_found') {
          toast.error('Message no longer exists.');
        } else {
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
        </>
      );
    },
    [currentUserId, handleToggleReaction]
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
        hasNextPage={hasNextPage}
        isFetchingNextPage={isFetchingNextPage}
        onLoadMore={() => void fetchNextPage()}
        renderReactionBar={renderReactionBar}
        scrollToMentionUsername={scrollToMention ? (session.user?.name ?? null) : null}
      />
      <ChatTypingIndicator typers={activeTypers} />
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
