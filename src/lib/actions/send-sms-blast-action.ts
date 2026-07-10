/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use server';

import 'server-only';

import { revalidatePath } from 'next/cache';

import type { ServerSession } from '@/lib/auth/get-server-session';
import { SmsBlastService } from '@/lib/services/sms-blast-service';
import { logSecurityEvent } from '@/lib/utils/audit-log';
import { requireRole } from '@/lib/utils/auth/require-role';
import { rateLimit } from '@/lib/utils/rate-limit';
import { smsBlastSchema } from '@/lib/validation/sms-blast-schema';

export type SendSmsBlastResult =
  | { success: true; recipientCount: number; sentCount: number; failedCount: number }
  | { success: false; error: string };

// 3 blasts per hour per admin — kept module-private ('use server' forbids exported consts).
const smsBlastLimiter = rateLimit({ interval: 60 * 60 * 1000, uniqueTokenPerInterval: 50 });
const SMS_BLAST_RATE_LIMIT = 3;

/** Enforce the per-admin rate limit; skipped under E2E so shards aren't tripped. */
const checkRateLimit = async (userId: string): Promise<SendSmsBlastResult | null> => {
  if (process.env.E2E_MODE === 'true') return null;
  try {
    await smsBlastLimiter.check(SMS_BLAST_RATE_LIMIT, userId);
    return null;
  } catch {
    return { success: false, error: 'Rate limit exceeded — try again later' };
  }
};

/**
 * Send an SMS blast to all opted-in subscribers.
 * Admin-only — enforces authorization, validates input, rate-limits per admin,
 * delegates to SmsBlastService, audit-logs, and revalidates the admin page.
 */
export const sendSmsBlastAction = async ({
  message,
}: {
  message: string;
}): Promise<SendSmsBlastResult> => {
  let session: ServerSession;
  try {
    session = await requireRole('admin');
  } catch {
    return { success: false, error: 'Unauthorized' };
  }

  const parsed = smsBlastSchema.safeParse({ message });
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0].message };
  }

  const rateLimitError = await checkRateLimit(session.user.id);
  if (rateLimitError !== null) return rateLimitError;

  const result = await SmsBlastService.sendBlast({
    message: parsed.data.message,
    sentById: session.user.id,
    sentByEmail: session.user.email,
  });

  if (!result.success) {
    return { success: false, error: result.error };
  }

  const { blastId, recipientCount, sentCount, failedCount } = result.data;

  logSecurityEvent({
    event: 'notification.sms.blast.sent',
    userId: session.user.id,
    metadata: { blastId, recipientCount, sentCount, failedCount },
  });

  revalidatePath('/admin/announcements');

  return { success: true, recipientCount, sentCount, failedCount };
};
