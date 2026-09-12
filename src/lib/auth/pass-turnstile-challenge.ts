/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import 'server-only';

import { setTurnstileGateCookie } from '@/lib/auth/turnstile-gate';
import { verifyTurnstile } from '@/lib/utils/verify-turnstile';

export interface PassTurnstileChallengeInput {
  /** Cloudflare Turnstile token captured by the widget. Single-use. */
  turnstileToken: string;
  /** Client IP, forwarded to siteverify for its own consistency check. */
  ip: string;
}

export interface PassTurnstileChallengeResult {
  success: boolean;
  error?: string;
}

/**
 * Verify a Turnstile token and, on success, issue the gate cookie that
 * better-auth's before hook requires on the browser-facing sign-in endpoints.
 * Every server action that consumes a Turnstile token ahead of a social
 * redirect goes through here, so the cookie is issued exactly once per token.
 */
export const passTurnstileChallenge = async ({
  turnstileToken,
  ip,
}: PassTurnstileChallengeInput): Promise<PassTurnstileChallengeResult> => {
  const turnstileResult = await verifyTurnstile(turnstileToken, ip);
  if (!turnstileResult.success) {
    return {
      success: false,
      error: turnstileResult.error || 'CAPTCHA verification failed. Please try again.',
    };
  }

  await setTurnstileGateCookie();

  return { success: true };
};
