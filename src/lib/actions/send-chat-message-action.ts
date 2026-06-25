/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use server';

import 'server-only';

import { headers } from 'next/headers';

import { auth } from '@/auth';
import { ChatService, type ChatMessageDto } from '@/lib/services/chat-service';
import { extractClientIpFromHeaders } from '@/lib/utils/extract-client-ip';
import { loggers } from '@/lib/utils/logger';
import { fieldErrorsFromZodIssues } from '@/lib/utils/zod-field-errors';
import { sendChatMessageSchema } from '@/lib/validation/chat-message-schema';

const logger = loggers.chat;

export type SendChatMessageActionResult =
  | { success: true; data: ChatMessageDto }
  | {
      success: false;
      error: 'unauthorized' | 'invalid' | 'rate_limited' | 'disabled';
      retryAfterSeconds?: number;
      fieldErrors?: Record<string, string[]>;
    };

interface SendChatMessageInput {
  body: string;
  fingerprint: string;
  /**
   * Optional client placeholder id. When supplied, the service echoes
   * it on the returned + broadcast DTO so the client can match the
   * persisted message to its optimistic placeholder.
   */
  tempId?: string;
}

/**
 * Persist a new chat message authored by the current session user, then
 * broadcast it via Pusher. Enforces rate limits + the disabled gate at
 * the service layer.
 */
export const sendChatMessageAction = async (
  input: SendChatMessageInput
): Promise<SendChatMessageActionResult> => {
  const session = await auth();
  if (!session?.user?.id || !session.user.email) {
    return { success: false, error: 'unauthorized' };
  }

  const parsed = sendChatMessageSchema.safeParse(input);
  if (!parsed.success) {
    const fieldErrors = fieldErrorsFromZodIssues(parsed.error.issues, { formKey: '_form' });
    return { success: false, error: 'invalid', fieldErrors };
  }

  const ip = extractClientIpFromHeaders(await headers());

  const result = await ChatService.sendMessage({
    userId: session.user.id,
    email: session.user.email,
    body: parsed.data.body,
    fingerprint: parsed.data.fingerprint,
    ip,
    tempId: parsed.data.tempId,
  });

  if (!result.success) {
    if (result.error === 'rate_limited') {
      return {
        success: false,
        error: 'rate_limited',
        retryAfterSeconds: result.retryAfterSeconds,
      };
    }
    return { success: false, error: result.error };
  }

  logger.info('Chat message sent', {
    module: 'CHAT',
    operation: 'sendMessage',
    userId: session.user.id,
  });

  return { success: true, data: result.data };
};
