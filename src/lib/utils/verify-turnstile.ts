/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use server';

import 'server-only';

import { CONSTANTS } from '@/lib/constants';
import { loggers } from '@/lib/utils/logger';

const logger = loggers.auth;

interface TurnstileVerifyResponse {
  success: boolean;
  'error-codes'?: string[];
  challenge_ts?: string;
  hostname?: string;
}

/**
 * Whether to skip the live siteverify call. Bypass only when BOTH conditions
 * are met: Cloudflare's well-known test secret key is in use AND we are not in
 * production. This prevents accidental bypass in production if the test secret
 * is misconfigured.
 * @see https://developers.cloudflare.com/turnstile/troubleshooting/testing/
 */
const shouldBypassVerification = (secret: string): boolean =>
  secret === CONSTANTS.TURNSTILE.TEST_SECRET && process.env.NODE_ENV !== 'production';

/**
 * Map a failed Turnstile verification result to a user-facing error message.
 * `invalid-input-response` signals a stale/invalid token the user can retry.
 */
const verificationFailureMessage = (result: TurnstileVerifyResponse): string => {
  const errorCodes = result['error-codes'] || [];
  logger.error('Turnstile verification failed', undefined, { errorCodes });
  return errorCodes.includes('invalid-input-response')
    ? 'Invalid verification. Please try again.'
    : 'Verification failed. Please refresh and try again.';
};

/**
 * Verifies a Cloudflare Turnstile token on the server side.
 * @param token - The token received from the Turnstile widget
 * @param ip - Optional IP address of the client for additional validation
 * @returns Object with success status and optional error message
 */
export const verifyTurnstile = async (
  token: string,
  ip?: string
): Promise<{ success: boolean; error?: string }> => {
  const secret = process.env.CLOUDFLARE_SECRET;

  if (!secret) {
    logger.error('CLOUDFLARE_SECRET environment variable is not set');
    return { success: false, error: 'Server configuration error' };
  }

  if (!token) {
    return { success: false, error: 'Turnstile token is required' };
  }

  // Skip the live API call when using Cloudflare's test secret outside production.
  if (shouldBypassVerification(secret)) {
    return { success: true };
  }

  try {
    const formData = new URLSearchParams();
    formData.append('secret', secret);
    formData.append('response', token);
    if (ip) {
      formData.append('remoteip', ip);
    }

    const response = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: formData.toString(),
    });

    if (!response.ok) {
      logger.error('Turnstile verification request failed', undefined, {
        status: response.status,
      });
      return { success: false, error: 'Verification service unavailable' };
    }

    const result: TurnstileVerifyResponse = await response.json();

    if (!result.success) {
      return { success: false, error: verificationFailureMessage(result) };
    }

    return { success: true };
  } catch (error) {
    logger.error('Turnstile verification error', error);
    return { success: false, error: 'Verification service error' };
  }
};
