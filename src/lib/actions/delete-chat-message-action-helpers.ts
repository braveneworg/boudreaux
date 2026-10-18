/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
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
  error: 'invalid';
}

type DeleteChatRequestValidation = ValidatedDeleteChatRequest | RejectedDeleteChatRequest;

/**
 * Validate the message input for a delete-chat request the action gate has
 * already admitted, returning a discriminated result: a blank id or an unknown
 * scope → `invalid`. The admin id comes from the gate's session.
 */
export const validateDeleteChatRequest = (
  adminId: string,
  input: DeleteChatRequestInput
): DeleteChatRequestValidation => {
  const messageId = input.messageId?.trim();
  if (!messageId || (input.scope !== 'message' && input.scope !== 'user')) {
    return { ok: false, error: 'invalid' };
  }

  return { ok: true, messageId, scope: input.scope, adminId };
};
