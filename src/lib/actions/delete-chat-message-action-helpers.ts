/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import type { ServerSession } from '@/lib/auth/get-server-session';

import type { DeleteChatMessageScope } from './delete-chat-message-action';

interface DeleteChatRequestInput {
  messageId: string;
  scope: DeleteChatMessageScope;
}

interface ValidatedDeleteChatRequest {
  ok: true;
  messageId: string;
  scope: DeleteChatMessageScope;
  adminId: string;
}

interface RejectedDeleteChatRequest {
  ok: false;
  error: 'unauthorized' | 'forbidden' | 'invalid';
}

type DeleteChatRequestValidation = ValidatedDeleteChatRequest | RejectedDeleteChatRequest;

/**
 * Validate the admin session and message input for a delete-chat request,
 * returning a discriminated result. Preserves the exact short-circuit order of
 * the prior inline guards: missing session → `unauthorized`, non-admin →
 * `forbidden`, blank id or unknown scope → `invalid`.
 */
export const validateDeleteChatRequest = (
  session: ServerSession | null,
  input: DeleteChatRequestInput
): DeleteChatRequestValidation => {
  if (!session?.user?.id) {
    return { ok: false, error: 'unauthorized' };
  }
  if (session.user.role !== 'admin') {
    return { ok: false, error: 'forbidden' };
  }

  const messageId = input.messageId?.trim();
  if (!messageId || (input.scope !== 'message' && input.scope !== 'user')) {
    return { ok: false, error: 'invalid' };
  }

  return { ok: true, messageId, scope: input.scope, adminId: session.user.id };
};
