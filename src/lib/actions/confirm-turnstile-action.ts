/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use server';

import 'server-only';

import { headers } from 'next/headers';

import { passTurnstileChallenge } from '@/lib/auth/pass-turnstile-challenge';
import { extractClientIpFromHeaders } from '@/lib/utils/extract-client-ip';
import { loggers } from '@/lib/utils/logger';
import {
  confirmTurnstileInputSchema,
  type ConfirmTurnstileInput,
} from '@/lib/validation/turnstile-token-schema';

const logger = loggers.auth;

export interface ConfirmTurnstileResult {
  success: boolean;
  error?: string;
}

/**
 * Called from the sign-in card right before `authClient.signIn.social`.
 * Consumes the Turnstile token server-side and issues the gate cookie that
 * better-auth's before hook requires on `/sign-in/social`. Sign-up uses
 * `stashSignupConsent` for the same step, since it also records the opt-ins.
 */
export const confirmTurnstile = async (
  input: ConfirmTurnstileInput
): Promise<ConfirmTurnstileResult> => {
  const parsed = confirmTurnstileInputSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? 'Invalid verification. Please try again.',
    };
  }

  try {
    const headersList = await headers();
    const ip = extractClientIpFromHeaders(headersList);

    return await passTurnstileChallenge({ turnstileToken: parsed.data.turnstileToken, ip });
  } catch (error: unknown) {
    logger.error('Turnstile confirmation failed', error);
    return { success: false, error: 'Verification failed. Please try again.' };
  }
};
