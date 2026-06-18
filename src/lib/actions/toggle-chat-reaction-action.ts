/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use server';

import 'server-only';

import { auth } from '@/auth';
import { ChatService, type ChatMessageDto } from '@/lib/services/chat-service';
import { chatReactionSchema } from '@/lib/validation/chat-message-schema';

export type ToggleChatReactionActionResult =
  | { success: true; data: ChatMessageDto }
  | {
      success: false;
      error: 'unauthorized' | 'invalid' | 'not_found' | 'disabled';
      fieldErrors?: Record<string, string[]>;
    };

interface ToggleChatReactionInput {
  messageId: string;
  emoji: string;
}

/** Add or remove the current user's reaction on a chat message. */
export const toggleChatReactionAction = async (
  input: ToggleChatReactionInput
): Promise<ToggleChatReactionActionResult> => {
  const session = await auth();
  if (!session?.user?.id) {
    return { success: false, error: 'unauthorized' };
  }

  const parsed = chatReactionSchema.safeParse(input);
  if (!parsed.success) {
    const fieldErrors = new Map<string, string[]>();
    for (const issue of parsed.error.issues) {
      const key = issue.path.join('.') || '_form';
      const messages = fieldErrors.get(key) ?? [];
      messages.push(issue.message);
      fieldErrors.set(key, messages);
    }
    return { success: false, error: 'invalid', fieldErrors: Object.fromEntries(fieldErrors) };
  }

  const result = await ChatService.toggleReaction({
    messageId: parsed.data.messageId,
    userId: session.user.id,
    emoji: parsed.data.emoji,
  });

  if (!result.success) {
    return { success: false, error: result.error };
  }

  return { success: true, data: result.data };
};
