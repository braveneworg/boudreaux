/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use server';

import 'server-only';

import { revalidatePath } from 'next/cache';

import { ChatAdminService } from '@/lib/services/chat-admin-service';
import { requireRole } from '@/lib/utils/auth/require-role';
import { loggers } from '@/lib/utils/logger';
import { updateChatUserSchema } from '@/lib/validation/chat-user-admin-schema';

const logger = loggers.chat;

export type UpdateChatUserActionResult =
  | { success: true }
  | {
      success: false;
      error: 'unauthorized' | 'invalid';
      fieldErrors?: Record<string, string[]>;
    };

interface UpdateChatUserInput {
  userId: string;
  disabled?: boolean;
  clearFlag?: boolean;
}

/**
 * Admin patch endpoint for moderating a single ChatUser. At least one of
 * `disabled` or `clearFlag` must be present in the input.
 */
export const updateChatUserAction = async (
  input: UpdateChatUserInput
): Promise<UpdateChatUserActionResult> => {
  try {
    await requireRole('admin');
  } catch {
    return { success: false, error: 'unauthorized' };
  }

  const parsed = updateChatUserSchema.safeParse(input);

  if (!parsed.success) {
    const fieldErrors: Record<string, string[]> = {};
    for (const issue of parsed.error.issues) {
      const key = issue.path.join('.') || '_form';
      (fieldErrors[key] ??= []).push(issue.message);
    }
    return { success: false, error: 'invalid', fieldErrors };
  }

  const { userId, disabled, clearFlag } = parsed.data;

  if (disabled !== undefined) {
    await ChatAdminService.setDisabled(userId, disabled);
    logger.info('ChatUser disabled flag toggled', {
      module: 'CHAT',
      operation: 'setDisabled',
      userId,
    });
  }

  if (clearFlag) {
    await ChatAdminService.clearFlag(userId);
    logger.info('ChatUser abuse flag cleared', {
      module: 'CHAT',
      operation: 'clearFlag',
      userId,
    });
  }

  revalidatePath('/admin/chat');

  return { success: true };
};
