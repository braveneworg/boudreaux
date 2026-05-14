/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
import 'server-only';

import { NoOpSmsService } from './noop-sms-service';
import { resolveSmsProvider, type SmsService } from './sms-service';
import { buildSnsSmsServiceFromEnv } from './sns-sms-service';

let cached: SmsService | null = null;

/**
 * Returns the process-wide {@link SmsService} singleton. Defaults to
 * the {@link NoOpSmsService} so dev/test environments never accidentally
 * dispatch real SMS; set `SMS_PROVIDER=sns` in production to swap in
 * the SNS-backed implementation.
 */
export function getSmsService(): SmsService {
  if (cached) return cached;
  const provider = resolveSmsProvider();
  cached = provider === 'sns' ? buildSnsSmsServiceFromEnv() : new NoOpSmsService();
  return cached;
}

/** Test-only — drops the cached instance between specs. */
export function resetSmsServiceForTesting(override?: SmsService): void {
  cached = override ?? null;
}
