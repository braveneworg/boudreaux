/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use server';

import 'server-only';

import { auth } from '@/auth';
import {
  ChatService,
  MAX_PINNED_CHAT_MESSAGES,
  type ChatMessageDto,
} from '@/lib/services/chat-service';
import { CHAT_EVENTS, triggerChatEvent } from '@/lib/utils/pusher-server';

export type TogglePinChatMessageActionResult =
  | { success: true; data: ChatMessageDto; pinned: boolean }
  | {
      success: false;
      error: 'unauthorized' | 'forbidden' | 'invalid' | 'not_found' | 'limit_reached';
      limit?: number;
    };

interface TogglePinChatMessageInput {
  messageId: string;
}

/**
 * Admin-only pin toggle. Pinning a message that isn't currently pinned
 * fails with `limit_reached` once the channel already has
 * `MAX_PINNED_CHAT_MESSAGES` pinned rows; the client surfaces a toast.
 * Unpinning is always allowed.
 */
export const togglePinChatMessageAction = async (
  input: TogglePinChatMessageInput
): Promise<TogglePinChatMessageActionResult> => {
  const session = await auth();
  if (!session?.user?.id) {
    return { success: false, error: 'unauthorized' };
  }
  if ((session.user as { role?: string | null }).role !== 'admin') {
    return { success: false, error: 'forbidden' };
  }

  const messageId = input.messageId?.trim();
  if (!messageId) {
    return { success: false, error: 'invalid' };
  }

  const result = await ChatService.togglePin({ messageId, adminId: session.user.id });
  if (!result.success) {
    if (result.error === 'limit_reached') {
      return { success: false, error: 'limit_reached', limit: MAX_PINNED_CHAT_MESSAGES };
    }
    return { success: false, error: result.error };
  }

  await triggerChatEvent(CHAT_EVENTS.messagePinChanged, result.data);
  return { success: true, data: result.data, pinned: result.pinned };
};
