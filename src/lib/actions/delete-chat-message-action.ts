/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use server';

import 'server-only';

import { auth } from '@/auth';
import { ChatMessageRepository } from '@/lib/repositories/chat-message-repository';
import { ChatAdminService } from '@/lib/services/chat-admin-service';
import { CHAT_EVENTS, triggerChatEvent } from '@/lib/utils/pusher-server';

export type DeleteChatMessageScope = 'message' | 'user';

export type DeleteChatMessageActionResult =
  | { success: true; deletedIds: string[] }
  | { success: false; error: 'unauthorized' | 'forbidden' | 'invalid' | 'not_found' };

interface DeleteChatMessageInput {
  messageId: string;
  scope: DeleteChatMessageScope;
}

/**
 * Admin-only soft delete. With `scope: 'message'` only the target row is
 * hidden; with `scope: 'user'` every visible message by the same author
 * is hidden. Either way a `messageDeleted` event is broadcast per row so
 * connected clients drop them in real time.
 */
export const deleteChatMessageAction = async (
  input: DeleteChatMessageInput
): Promise<DeleteChatMessageActionResult> => {
  const session = await auth();
  if (!session?.user?.id) {
    return { success: false, error: 'unauthorized' };
  }
  if ((session.user as { role?: string | null }).role !== 'admin') {
    return { success: false, error: 'forbidden' };
  }

  const messageId = input.messageId?.trim();
  if (!messageId || (input.scope !== 'message' && input.scope !== 'user')) {
    return { success: false, error: 'invalid' };
  }

  const adminId = session.user.id;

  if (input.scope === 'message') {
    await ChatAdminService.hideMessage({ messageId, adminId });
    await triggerChatEvent(CHAT_EVENTS.messageDeleted, { messageId });
    return { success: true, deletedIds: [messageId] };
  }

  const target = await ChatMessageRepository.findById(messageId);
  if (!target) {
    return { success: false, error: 'not_found' };
  }

  const deletedIds = await ChatAdminService.hideAllMessagesByUser({
    userId: target.userId,
    adminId,
  });
  await Promise.all(
    deletedIds.map((id) => triggerChatEvent(CHAT_EVENTS.messageDeleted, { messageId: id }))
  );
  return { success: true, deletedIds };
};
