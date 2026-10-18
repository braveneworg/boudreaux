/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
'use server';

import 'server-only';

import { revalidatePath } from 'next/cache';
import { headers } from 'next/headers';

import { gateAction } from '@/lib/auth/action-gate';
import { ChatAdminService } from '@/lib/services/chat-admin-service';
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
  const gate = await gateAction('admin');
  if (!gate.success) {
    return { success: false, error: 'unauthorized' };
  }
  const { session } = gate;

  const parsed = banIdentitySchema.safeParse(input);
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

  const adminId = session.user.id;

  const adminHeaders = await headers();

  const ban = await ChatAdminService.banIdentity({
    userId: parsed.data.userId ?? null,
    email: parsed.data.email,
    fingerprintHash: parsed.data.fingerprintHash ?? null,
    adminId,
    reason: parsed.data.reason,
    adminHeaders,
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
