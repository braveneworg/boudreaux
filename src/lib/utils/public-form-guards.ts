/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import 'server-only';

import { headers } from 'next/headers';

import type { FormState } from '@/lib/types/form-state';
import { extractClientIpFromHeaders } from '@/lib/utils/extract-client-ip';
import { verifyTurnstile } from '@/lib/utils/verify-turnstile';

interface RateLimiter {
  check(limit: number, token: string): Promise<void>;
}

interface PublicFormGuardOptions {
  payload: FormData;
  limiter: RateLimiter;
  maxRequests: number;
  rateLimitMessage: string;
}

/**
 * Shared pre-validation guard for unauthenticated public form actions (signup,
 * contact, …): resolves the client IP, enforces the rate limit, and verifies the
 * Cloudflare Turnstile token. Returns an error `FormState` for the caller to
 * return immediately, or `null` when every check passes.
 *
 * The rate limit is skipped under E2E (shards share one IP, same opt-out as
 * `withRateLimit`) so the suite isn't tripped by the per-IP limit.
 */
export const checkPublicFormGuards = async ({
  payload,
  limiter,
  maxRequests,
  rateLimitMessage,
}: PublicFormGuardOptions): Promise<FormState | null> => {
  const headersList = await headers();
  const ip = extractClientIpFromHeaders(headersList);

  if (process.env.E2E_MODE !== 'true') {
    try {
      await limiter.check(maxRequests, ip);
    } catch {
      return { success: false, errors: { general: [rateLimitMessage] }, fields: {} };
    }
  }

  const turnstileToken = payload.get('cf-turnstile-response') as string | null;
  if (!turnstileToken) {
    return {
      success: false,
      errors: { general: ['CAPTCHA verification required. Please complete the verification.'] },
      fields: {},
    };
  }

  const turnstileResult = await verifyTurnstile(turnstileToken, ip);
  if (!turnstileResult.success) {
    return {
      success: false,
      errors: {
        general: [turnstileResult.error || 'CAPTCHA verification failed. Please try again.'],
      },
      fields: {},
    };
  }

  return null;
};
