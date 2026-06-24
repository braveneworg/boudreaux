/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use client';

import { Pin, SmilePlus, Trash2 } from 'lucide-react';

import type { OptimisticChatMessage } from '@/hooks/use-optimistic-chat';

import { ChatEmojiPicker } from './chat-emoji-picker';
import { ChatReactionBar } from './chat-reaction-bar';

interface ChatMessageReactionBarProps {
  message: OptimisticChatMessage;
  currentUserId: string;
  isAdmin: boolean;
  onToggleReaction: (messageId: string, emoji: string) => void;
  onRequestDelete: (messageId: string, authorUsername: string | null) => void;
  onTogglePin: (messageId: string) => void;
}

export const ChatMessageReactionBar = ({
  message,
  currentUserId,
  isAdmin,
  onToggleReaction,
  onRequestDelete,
  onTogglePin,
}: ChatMessageReactionBarProps): React.ReactNode => {
  if (message.tempId) return null;

  return (
    <>
      <ChatReactionBar
        reactions={message.reactions}
        currentUserId={currentUserId}
        onToggle={(emoji) => onToggleReaction(message.id, emoji)}
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
        onSelect={(emoji) => onToggleReaction(message.id, emoji)}
      />
      {isAdmin && (
        <button
          type="button"
          aria-label="Delete message"
          data-testid="chat-delete-message"
          onClick={() => onRequestDelete(message.id, message.user.username)}
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
          onClick={() => onTogglePin(message.id)}
          className="text-muted-foreground hover:text-foreground inline-flex items-center justify-center rounded-md p-1 transition-colors"
        >
          <Pin aria-hidden="true" className="size-4" />
        </button>
      )}
    </>
  );
};

interface ChatMessagePinIndicatorProps {
  message: OptimisticChatMessage;
  isAdmin: boolean;
  onTogglePin: (messageId: string) => void;
}

export const ChatMessagePinIndicator = ({
  message,
  isAdmin,
  onTogglePin,
}: ChatMessagePinIndicatorProps): React.ReactNode => {
  if (isAdmin) {
    return (
      <button
        type="button"
        aria-label="Unpin message"
        data-testid="chat-unpin-message"
        onClick={() => onTogglePin(message.id)}
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
};
