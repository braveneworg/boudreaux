/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
import 'server-only';

/**
 * Provider-agnostic SMS dispatch surface.
 *
 * Call sites depend only on this interface; the concrete provider
 * (`SnsSmsService` in production, `NoOpSmsService` in dev/test) is
 * selected at the composition root via {@link getSmsService}.
 */
export interface SmsService {
  /**
   * Send a single SMS. Returns a `SmsResult` describing success or
   * failure. Implementations MUST NOT throw — failures must be returned
   * as `{ ok: false, error }` so caller fan-out logic can attempt the
   * remaining recipients without short-circuiting.
   */
  send(to: string, body: string, opts?: SmsSendOptions): Promise<SmsResult>;
}

export interface SmsSendOptions {
  /**
   * When true (default), the message is sent as a `Transactional`
   * AWS SNS SMSType — higher delivery priority, no STOP-keyword
   * tracking. System-to-admin alerts MUST set this to true.
   */
  transactional?: boolean;
}

export type SmsResult = { ok: true; messageId: string } | { ok: false; error: string };

/**
 * Resolves which SMS provider to construct. Defaults to the safe
 * no-op so local dev/test never accidentally hits the network. Set
 * `SMS_PROVIDER=sns` in production to enable real delivery via SNS.
 */
export const resolveSmsProvider = (): 'sns' | 'noop' => {
  const explicit = process.env.SMS_PROVIDER?.trim().toLowerCase();
  if (explicit === 'sns') return 'sns';
  if (explicit === 'noop') return 'noop';
  return 'noop';
};
