/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
'use server';

import 'server-only';

import { revalidatePath } from 'next/cache';

import { ChatAdminService } from '@/lib/services/chat-admin-service';
import { requireRole } from '@/lib/utils/auth/require-role';
import { loggers } from '@/lib/utils/logger';
import { banIdentitySchema, type BanIdentityInput } from '@/lib/validation/abuse-report-schema';

const logger = loggers.chat;

export type BanIdentityActionResult =
  | { success: true; banId: string }
  | {
      success: false;
      error: 'unauthorized' | 'invalid';
      fieldErrors?: Record<string, string[]>;
    };

export const banIdentityAction = async (
  input: BanIdentityInput
): Promise<BanIdentityActionResult> => {
  let session: Awaited<ReturnType<typeof requireRole>>;
  try {
    session = await requireRole('admin');
  } catch {
    return { success: false, error: 'unauthorized' };
  }

  const parsed = banIdentitySchema.safeParse(input);
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

  const ban = await ChatAdminService.banIdentity({
    userId: parsed.data.userId ?? null,
    email: parsed.data.email,
    fingerprintHash: parsed.data.fingerprintHash ?? null,
    adminId,
    reason: parsed.data.reason,
  });

  logger.info('Identity banned', {
    module: 'CHAT',
    operation: 'banIdentityAction',
    banId: ban.id,
    adminId,
  });

  revalidatePath('/admin/chat');
  return { success: true, banId: ban.id };
};
