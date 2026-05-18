/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { useCallback, useEffect, useRef, useState } from 'react';

import type { ChatMessageDto } from '@/lib/services/chat-service';
import { getPusherClient } from '@/lib/utils/pusher-client';

import type { PresenceChannel } from 'pusher-js';

/** Wire-format event names broadcast by the server, plus the client-typing event. */
export const CHAT_CHANNEL_NAME = 'presence-fake-four-chat';
export const CLIENT_TYPING_EVENT = 'client-typing';
export const SERVER_NEW_MESSAGE = 'new-message';
export const SERVER_REACTION_UPDATED = 'reaction-updated';
export const SERVER_MESSAGE_DELETED = 'message-deleted';
export const SERVER_MESSAGE_PIN_CHANGED = 'message-pin-changed';

export interface MessageDeletedPayload {
  messageId: string;
}

const TYPING_THROTTLE_MS = 1500;

export interface PresenceMember {
  id: string;
  info: {
    username: string | null;
    gravatarHash: string;
  };
}

export interface TypingPayload {
  userId: string;
  username: string | null;
}

interface UseChatChannelParams {
  enabled: boolean;
  onNewMessage?: (message: ChatMessageDto) => void;
  onReactionUpdated?: (message: ChatMessageDto) => void;
  onMessageDeleted?: (payload: MessageDeletedPayload) => void;
  onMessagePinChanged?: (message: ChatMessageDto) => void;
  onTyping?: (payload: TypingPayload) => void;
}

type PresenceMembersSnapshot = {
  count: number;
  each: (cb: (member: PresenceMember) => void) => void;
  me: PresenceMember | null;
};

/**
 * Subscribe to the global presence chat channel. Wires server-broadcast
 * events to caller-supplied callbacks (held in refs so identity changes
 * don't re-bind handlers) and tracks the live member roster in state.
 *
 * The channel is left open on unmount only if disabled; otherwise we
 * unsubscribe to release the free-tier connection back to the pool.
 */
export function useChatChannel({
  enabled,
  onNewMessage,
  onReactionUpdated,
  onMessageDeleted,
  onMessagePinChanged,
  onTyping,
}: UseChatChannelParams) {
  const [members, setMembers] = useState<PresenceMember[]>([]);

  const channelRef = useRef<PresenceChannel | null>(null);
  const lastTypingSentRef = useRef(0);

  // Stash latest callbacks in refs so we don't have to re-bind on every render.
  const onNewMessageRef = useRef(onNewMessage);
  const onReactionUpdatedRef = useRef(onReactionUpdated);
  const onMessageDeletedRef = useRef(onMessageDeleted);
  const onMessagePinChangedRef = useRef(onMessagePinChanged);
  const onTypingRef = useRef(onTyping);
  useEffect(() => {
    onNewMessageRef.current = onNewMessage;
    onReactionUpdatedRef.current = onReactionUpdated;
    onMessageDeletedRef.current = onMessageDeleted;
    onMessagePinChangedRef.current = onMessagePinChanged;
    onTypingRef.current = onTyping;
  }, [onNewMessage, onReactionUpdated, onMessageDeleted, onMessagePinChanged, onTyping]);

  useEffect(() => {
    if (!enabled) return;

    const client = getPusherClient();
    const channel = client.subscribe(CHAT_CHANNEL_NAME) as PresenceChannel;
    channelRef.current = channel;

    const handleSucceeded = (presenceMembers: PresenceMembersSnapshot) => {
      const roster: PresenceMember[] = [];
      presenceMembers.each((m) => roster.push(m));
      setMembers(roster);
    };
    const handleAdded = (member: PresenceMember) => {
      setMembers((prev) => (prev.some((m) => m.id === member.id) ? prev : [...prev, member]));
    };
    const handleRemoved = (member: PresenceMember) => {
      setMembers((prev) => prev.filter((m) => m.id !== member.id));
    };
    const handleNewMessage = (payload: ChatMessageDto) => {
      onNewMessageRef.current?.(payload);
    };
    const handleReaction = (payload: ChatMessageDto) => {
      onReactionUpdatedRef.current?.(payload);
    };
    const handleMessageDeleted = (payload: MessageDeletedPayload) => {
      onMessageDeletedRef.current?.(payload);
    };
    const handleMessagePinChanged = (payload: ChatMessageDto) => {
      onMessagePinChangedRef.current?.(payload);
    };
    const handleTyping = (payload: TypingPayload) => {
      onTypingRef.current?.(payload);
    };

    channel.bind('pusher:subscription_succeeded', handleSucceeded);
    channel.bind('pusher:member_added', handleAdded);
    channel.bind('pusher:member_removed', handleRemoved);
    channel.bind(SERVER_NEW_MESSAGE, handleNewMessage);
    channel.bind(SERVER_REACTION_UPDATED, handleReaction);
    channel.bind(SERVER_MESSAGE_DELETED, handleMessageDeleted);
    channel.bind(SERVER_MESSAGE_PIN_CHANGED, handleMessagePinChanged);
    channel.bind(CLIENT_TYPING_EVENT, handleTyping);

    return () => {
      channel.unbind('pusher:subscription_succeeded', handleSucceeded);
      channel.unbind('pusher:member_added', handleAdded);
      channel.unbind('pusher:member_removed', handleRemoved);
      channel.unbind(SERVER_NEW_MESSAGE, handleNewMessage);
      channel.unbind(SERVER_REACTION_UPDATED, handleReaction);
      channel.unbind(SERVER_MESSAGE_DELETED, handleMessageDeleted);
      channel.unbind(SERVER_MESSAGE_PIN_CHANGED, handleMessagePinChanged);
      channel.unbind(CLIENT_TYPING_EVENT, handleTyping);
      client.unsubscribe(CHAT_CHANNEL_NAME);
      channelRef.current = null;
      setMembers([]);
    };
  }, [enabled]);

  /**
   * Broadcast a client-typing event. Throttled to once per 1.5s so a long
   * burst of keystrokes doesn't exhaust the Pusher message quota.
   */
  const sendTyping = useCallback((payload: TypingPayload) => {
    const channel = channelRef.current;
    if (!channel) return;
    const now = Date.now();
    if (now - lastTypingSentRef.current < TYPING_THROTTLE_MS) return;
    lastTypingSentRef.current = now;
    channel.trigger(CLIENT_TYPING_EVENT, payload);
  }, []);

  return { members, sendTyping };
}
