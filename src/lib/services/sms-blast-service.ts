/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import 'server-only';

import { SmsBlastRepository } from '@/lib/repositories/sms-blast-repository';
import { UserRepository } from '@/lib/repositories/user-repository';
import { getSmsService } from '@/lib/services/get-sms-service';
import type { SmsService } from '@/lib/services/sms-service';
import type { SmsBlastRecord } from '@/lib/types/domain/sms-blast';
import type { UserSmsRecipientRecord } from '@/lib/types/domain/user';
import { loggers } from '@/lib/utils/logger';
import { normalizeUsPhoneToE164 } from '@/lib/utils/phone';
import { buildSmsBlastMessage } from '@/lib/utils/sms-blast-message';

import type { ServiceResponse } from './service.types';

export interface SmsBlastSendInput {
  message: string;
  sentById: string;
  sentByEmail: string;
}

export interface SmsBlastSendResult {
  blastId: string;
  recipientCount: number;
  sentCount: number;
  failedCount: number;
}

export const SMS_BLAST_CHUNK_SIZE = 10;
export const SMS_BLAST_INTER_CHUNK_DELAY_MS = 500;

/** Split an array into sequential sub-arrays of at most `size` elements. */
const chunk = <T>(items: T[], size: number): T[][] => {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
};

/** Resolves immediately when ms <= 0; otherwise suspends for ms milliseconds. */
const sleep = (ms: number): Promise<void> =>
  ms <= 0 ? Promise.resolve() : new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Attempts to send to one recipient. Returns whether the send succeeded.
 * Never throws — both {ok:false} results and rejected promises count as failure.
 * NEVER logs the phone number; only the userId.
 */
const sendToRecipient = async (
  sms: SmsService,
  { id, phone }: UserSmsRecipientRecord,
  finalMessage: string
): Promise<{ sent: boolean }> => {
  if (!phone) return { sent: false };
  const to = normalizeUsPhoneToE164(phone) ?? phone;
  try {
    const result = await sms.send(to, finalMessage, { transactional: false });
    if (result.ok) return { sent: true };
    loggers.notifications.warn('[sms_blast_service] SMS send failed', { userId: id });
    return { sent: false };
  } catch {
    loggers.notifications.warn('[sms_blast_service] SMS send threw unexpectedly', { userId: id });
    return { sent: false };
  }
};

/**
 * Sends the blast message to all recipients in sequential chunks of
 * `SMS_BLAST_CHUNK_SIZE`, waiting `delayMs` between each chunk (not after
 * the last). Exported for unit testing (pass delayMs = 0 to avoid sleeping).
 */
export const sendInChunks = async (
  sms: SmsService,
  recipients: UserSmsRecipientRecord[],
  finalMessage: string,
  delayMs: number
): Promise<{ sentCount: number; failedCount: number }> => {
  const chunks = chunk(recipients, SMS_BLAST_CHUNK_SIZE);
  let sentCount = 0;
  let failedCount = 0;

  for (const [i, currentChunk] of chunks.entries()) {
    const results = await Promise.allSettled(
      currentChunk.map((r) => sendToRecipient(sms, r, finalMessage))
    );
    for (const result of results) {
      if (result.status === 'fulfilled' && result.value.sent) {
        sentCount++;
      } else {
        failedCount++;
      }
    }
    if (i < chunks.length - 1) {
      await sleep(delayMs);
    }
  }

  return { sentCount, failedCount };
};

export class SmsBlastService {
  /** Returns the count of users opted into SMS notifications. */
  static async getRecipientCount(): Promise<ServiceResponse<number>> {
    try {
      const data = await UserRepository.countSmsOptedIn();
      return { success: true, data };
    } catch {
      return { success: false, error: 'Failed to fetch recipient count', code: 'UNKNOWN' };
    }
  }

  /** Returns the most-recent SMS blast history records, newest first. */
  static async getRecentBlasts(limit: number): Promise<ServiceResponse<SmsBlastRecord[]>> {
    try {
      const data = await SmsBlastRepository.findRecent(limit);
      return { success: true, data };
    } catch {
      return { success: false, error: 'Failed to fetch recent blasts', code: 'UNKNOWN' };
    }
  }

  /**
   * Sends an SMS blast to all opted-in subscribers in throttled chunks,
   * then persists a history record. Returns counts for the admin UI.
   *
   * Failures from individual recipients are counted but never abort the
   * remaining sends. If no opted-in users exist, returns a failure without
   * creating a history record.
   */
  static async sendBlast({
    message,
    sentById,
    sentByEmail,
  }: SmsBlastSendInput): Promise<ServiceResponse<SmsBlastSendResult>> {
    try {
      const allUsers = await UserRepository.findSmsOptedInUsers();
      const users = allUsers.filter((u) => Boolean(u.phone?.trim()));
      const recipientCount = users.length;

      if (recipientCount === 0) {
        return { success: false, error: 'No opted-in SMS subscribers', code: 'INVALID_INPUT' };
      }

      const finalMessage = buildSmsBlastMessage(message);

      loggers.notifications.operationStart('sms_blast_send', { recipientCount });

      const sms = getSmsService();
      const { sentCount, failedCount } = await sendInChunks(
        sms,
        users,
        finalMessage,
        SMS_BLAST_INTER_CHUNK_DELAY_MS
      );

      let blast: SmsBlastRecord;
      try {
        blast = await SmsBlastRepository.create({
          message: finalMessage,
          sentById,
          sentByEmail,
          recipientCount,
          sentCount,
          failedCount,
        });
      } catch (recordError) {
        // The fan-out already went out. Surface an unambiguous "do not resend"
        // so the admin never re-texts everyone over a lost history row.
        // Log counts only — never any phone number.
        loggers.notifications.operationFailed('sms_blast_record', recordError, {
          recipientCount,
          sentCount,
          failedCount,
        });
        return {
          success: false,
          code: 'UNKNOWN',
          error: `Blast sent (${sentCount} of ${recipientCount}) but history failed to record — do not resend`,
        };
      }

      loggers.notifications.operationComplete('sms_blast_send', {
        blastId: blast.id,
        sentCount,
        failedCount,
      });

      return {
        success: true,
        data: { blastId: blast.id, recipientCount, sentCount, failedCount },
      };
    } catch (error) {
      loggers.notifications.operationFailed('sms_blast_send', error);
      return { success: false, error: 'Failed to send SMS blast', code: 'UNKNOWN' };
    }
  }
}
