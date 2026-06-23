/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
import 'server-only';

import { loggers } from '@/lib/utils/logger';

import type { SmsResult, SmsSendOptions, SmsService } from './sms-service';

export interface CapturedSms {
  to: string;
  body: string;
  transactional: boolean;
  sentAt: Date;
}

/**
 * Local-dev / test SMS provider. Captures every send into an in-memory
 * array so Vitest specs can assert on dispatched messages, and logs via
 * the project logger so a developer running `pnpm run dev` can see what
 * would have gone out without ever hitting AWS.
 */
export class NoOpSmsService implements SmsService {
  private readonly captured: CapturedSms[] = [];

  async send(to: string, body: string, opts?: SmsSendOptions): Promise<SmsResult> {
    const transactional = opts?.transactional ?? true;
    const record: CapturedSms = {
      to,
      body,
      transactional,
      sentAt: new Date(),
    };
    this.captured.push(record);
    // Phone numbers are PII; log a redacted form so transcripts stay clean.
    const redactedTo = redactPhone(to);
    loggers.notifications.debug(
      `[NoOpSmsService] would send ${transactional ? 'transactional' : 'promotional'} SMS to ${redactedTo}: ${body}`
    );
    return { ok: true, messageId: `noop-${Date.now()}-${this.captured.length}` };
  }

  /** Test-only — returns a snapshot of every SMS sent through this instance. */
  getCaptured(): readonly CapturedSms[] {
    return this.captured.slice();
  }

  /** Test-only — drops captured records between specs. */
  reset(): void {
    this.captured.length = 0;
  }
}

const redactPhone = (to: string): string => {
  const trimmed = to.trim();
  if (trimmed.length <= 4) return '****';
  return `${trimmed.slice(0, 2)}***${trimmed.slice(-2)}`;
};
