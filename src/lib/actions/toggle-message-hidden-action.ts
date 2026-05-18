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
  toggleMessageHiddenSchema,
  type ToggleMessageHiddenInput,
} from '@/lib/validation/abuse-report-schema';

const logger = loggers.chat;

export type ToggleMessageHiddenActionResult =
  | { success: true }
  | {
      success: false;
      error: 'unauthorized' | 'invalid';
      fieldErrors?: Record<string, string[]>;
    };

/**
 * Per-message hide/unhide toggle. Hides applied here are recorded with
 * `hiddenReason: "admin_flagged"` so they survive a future re-enable
 * of the author (see {@link disableChatUserAction} for the contrast).
 */
export const toggleMessageHiddenAction = async (
  input: ToggleMessageHiddenInput
): Promise<ToggleMessageHiddenActionResult> => {
  let session: Awaited<ReturnType<typeof requireRole>>;
  try {
    session = await requireRole('admin');
  } catch {
    return { success: false, error: 'unauthorized' };
  }

  const parsed = toggleMessageHiddenSchema.safeParse(input);
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

  if (parsed.data.hidden) {
    await ChatAdminService.hideMessage({ messageId: parsed.data.messageId, adminId });
  } else {
    await ChatAdminService.unhideMessage(parsed.data.messageId);
  }

  logger.info('Message hide toggled', {
    module: 'CHAT',
    operation: 'toggleMessageHiddenAction',
    messageId: parsed.data.messageId,
    hidden: parsed.data.hidden,
    adminId,
  });

  revalidatePath('/admin/chat');
  return { success: true };
};
