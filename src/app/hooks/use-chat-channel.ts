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

interface PresenceHandlers {
  handleSucceeded: (presenceMembers: PresenceMembersSnapshot) => void;
  handleAdded: (member: PresenceMember) => void;
  handleRemoved: (member: PresenceMember) => void;
  handleNewMessage: (payload: ChatMessageDto) => void;
  handleReaction: (payload: ChatMessageDto) => void;
  handleMessageDeleted: (payload: MessageDeletedPayload) => void;
  handleMessagePinChanged: (payload: ChatMessageDto) => void;
  handleTyping: (payload: TypingPayload) => void;
}

/** Refs holding the latest caller-supplied event callbacks. */
interface CallbackRefs {
  onNewMessage: React.RefObject<((message: ChatMessageDto) => void) | undefined>;
  onReactionUpdated: React.RefObject<((message: ChatMessageDto) => void) | undefined>;
  onMessageDeleted: React.RefObject<((payload: MessageDeletedPayload) => void) | undefined>;
  onMessagePinChanged: React.RefObject<((message: ChatMessageDto) => void) | undefined>;
  onTyping: React.RefObject<((payload: TypingPayload) => void) | undefined>;
}

/** Build all Pusher event handlers for the presence channel. */
const makePresenceHandlers = (
  setMembers: React.Dispatch<React.SetStateAction<PresenceMember[]>>,
  refs: CallbackRefs
): PresenceHandlers => ({
  handleSucceeded: (presenceMembers) => {
    const roster: PresenceMember[] = [];
    presenceMembers.each((m) => roster.push(m));
    setMembers(roster);
  },
  handleAdded: (member) =>
    setMembers((prev) => (prev.some((m) => m.id === member.id) ? prev : [...prev, member])),
  handleRemoved: (member) => setMembers((prev) => prev.filter((m) => m.id !== member.id)),
  handleNewMessage: (payload) => refs.onNewMessage.current?.(payload),
  handleReaction: (payload) => refs.onReactionUpdated.current?.(payload),
  handleMessageDeleted: (payload) => refs.onMessageDeleted.current?.(payload),
  handleMessagePinChanged: (payload) => refs.onMessagePinChanged.current?.(payload),
  handleTyping: (payload) => refs.onTyping.current?.(payload),
});

/** Bind all presence-channel handlers to the given channel. */
const bindPresenceHandlers = (channel: PresenceChannel, h: PresenceHandlers): void => {
  channel.bind('pusher:subscription_succeeded', h.handleSucceeded);
  channel.bind('pusher:member_added', h.handleAdded);
  channel.bind('pusher:member_removed', h.handleRemoved);
  channel.bind(SERVER_NEW_MESSAGE, h.handleNewMessage);
  channel.bind(SERVER_REACTION_UPDATED, h.handleReaction);
  channel.bind(SERVER_MESSAGE_DELETED, h.handleMessageDeleted);
  channel.bind(SERVER_MESSAGE_PIN_CHANGED, h.handleMessagePinChanged);
  channel.bind(CLIENT_TYPING_EVENT, h.handleTyping);
};

/** Unbind all presence-channel handlers from the given channel. */
const unbindPresenceHandlers = (channel: PresenceChannel, h: PresenceHandlers): void => {
  channel.unbind('pusher:subscription_succeeded', h.handleSucceeded);
  channel.unbind('pusher:member_added', h.handleAdded);
  channel.unbind('pusher:member_removed', h.handleRemoved);
  channel.unbind(SERVER_NEW_MESSAGE, h.handleNewMessage);
  channel.unbind(SERVER_REACTION_UPDATED, h.handleReaction);
  channel.unbind(SERVER_MESSAGE_DELETED, h.handleMessageDeleted);
  channel.unbind(SERVER_MESSAGE_PIN_CHANGED, h.handleMessagePinChanged);
  channel.unbind(CLIENT_TYPING_EVENT, h.handleTyping);
};

/**
 * Subscribe to the global presence chat channel. Wires server-broadcast
 * events to caller-supplied callbacks (held in refs so identity changes
 * don't re-bind handlers) and tracks the live member roster in state.
 *
 * The channel is left open on unmount only if disabled; otherwise we
 * unsubscribe to release the free-tier connection back to the pool.
 */
export const useChatChannel = ({
  enabled,
  onNewMessage,
  onReactionUpdated,
  onMessageDeleted,
  onMessagePinChanged,
  onTyping,
}: UseChatChannelParams): {
  members: PresenceMember[];
  sendTyping: (payload: TypingPayload) => void;
} => {
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

    const handlers = makePresenceHandlers(setMembers, {
      onNewMessage: onNewMessageRef,
      onReactionUpdated: onReactionUpdatedRef,
      onMessageDeleted: onMessageDeletedRef,
      onMessagePinChanged: onMessagePinChangedRef,
      onTyping: onTypingRef,
    });
    bindPresenceHandlers(channel, handlers);

    return () => {
      unbindPresenceHandlers(channel, handlers);
      client.unsubscribe(CHAT_CHANNEL_NAME);
      channelRef.current = null;
      setMembers([]);
    };
  }, [enabled]);

  /**
   * Broadcast a client-typing event. Throttled to once per 1.5s so a long
   * burst of keystrokes doesn't exhaust the Pusher message quota.
   */
  const sendTyping = useCallback((payload: TypingPayload): void => {
    const channel = channelRef.current;
    if (!channel) return;
    const now = Date.now();
    if (now - lastTypingSentRef.current < TYPING_THROTTLE_MS) return;
    lastTypingSentRef.current = now;
    channel.trigger(CLIENT_TYPING_EVENT, payload);
  }, []);

  return { members, sendTyping };
};
