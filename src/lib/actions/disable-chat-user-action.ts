/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
'use server';

import 'server-only';

import { revalidatePath } from 'next/cache';

import { ChatAdminService } from '@/lib/services/chat-admin-service';
import { requireRole } from '@/lib/utils/auth/require-role';
import { loggers } from '@/lib/utils/logger';
import {
  disableChatUserSchema,
  enableChatUserSchema,
  type DisableChatUserInput,
  type EnableChatUserInput,
} from '@/lib/validation/abuse-report-schema';

const logger = loggers.chat;

export type DisableChatUserActionResult =
  | { success: true }
  | {
      success: false;
      error: 'unauthorized' | 'invalid';
      fieldErrors?: Record<string, string[]>;
    };

/**
 * Disable a user from chat with audit metadata (admin id + reason).
 *
 * Soft-hide of the disabled user's existing messages is implemented in
 * the public chat query (it filters by `author.disabled` at read time),
 * so this action does not bulk-update messages. The cheaper read-time
 * filter means re-enable is also a no-op for messages — only the
 * `ChatUser.disabled` flag flips.
 */
export const disableChatUserAction = async (
  input: DisableChatUserInput
): Promise<DisableChatUserActionResult> => {
  let session: Awaited<ReturnType<typeof requireRole>>;
  try {
    session = await requireRole('admin');
  } catch {
    return { success: false, error: 'unauthorized' };
  }

  const parsed = disableChatUserSchema.safeParse(input);
  if (!parsed.success) {
    const fieldErrors: Record<string, string[]> = {};
    for (const issue of parsed.error.issues) {
      const key = issue.path.join('.') || '_form';
      (fieldErrors[key] ??= []).push(issue.message);
    }
    return { success: false, error: 'invalid', fieldErrors };
  }

  const adminId = session.user.id;
  if (!adminId) return { success: false, error: 'unauthorized' };

  await ChatAdminService.disableChatUser({
    userId: parsed.data.userId,
    adminId,
    reason: parsed.data.reason,
  });

  logger.info('ChatUser disabled with audit', {
    module: 'CHAT',
    operation: 'disableChatUserAction',
    userId: parsed.data.userId,
    adminId,
  });

  revalidatePath('/admin/chat');
  revalidatePath(`/admin/chat/users/${parsed.data.userId}`);
  return { success: true };
};

export const enableChatUserAction = async (
  input: EnableChatUserInput
): Promise<DisableChatUserActionResult> => {
  try {
    await requireRole('admin');
  } catch {
    return { success: false, error: 'unauthorized' };
  }

  const parsed = enableChatUserSchema.safeParse(input);
  if (!parsed.success) {
    const fieldErrors: Record<string, string[]> = {};
    for (const issue of parsed.error.issues) {
      const key = issue.path.join('.') || '_form';
      (fieldErrors[key] ??= []).push(issue.message);
    }
    return { success: false, error: 'invalid', fieldErrors };
  }

  await ChatAdminService.enableChatUser(parsed.data.userId);

  logger.info('ChatUser re-enabled', {
    module: 'CHAT',
    operation: 'enableChatUserAction',
    userId: parsed.data.userId,
  });

  revalidatePath('/admin/chat');
  revalidatePath(`/admin/chat/users/${parsed.data.userId}`);
  return { success: true };
};
