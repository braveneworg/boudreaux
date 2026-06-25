/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import 'server-only';

import { headers } from 'next/headers';

import { extractClientIpFromHeaders } from '@/lib/utils/extract-client-ip';

interface RateLimiter {
  check: (limit: number, token: string) => Promise<void>;
}

/**
 * True when `sessionId` looks like a Stripe checkout session id (`cs_…`). Used
 * as the trust-anchor format gate before any DB lookup.
 */
export const isValidCheckoutSessionId = (sessionId: string): boolean =>
  Boolean(sessionId) && sessionId.startsWith('cs_');

/**
 * Apply the unauthenticated-caller rate limit for the purchase-session flow.
 * Skipped under E2E (shards share one IP, same opt-out as `withRateLimit`).
 * Returns `true` when the caller is over the limit and the action should bail
 * with `rate_limited`. Mirrors the prior inline guard exactly.
 */
export const isPurchaseSessionRateLimited = async (limiter: RateLimiter): Promise<boolean> => {
  if (process.env.E2E_MODE === 'true') {
    return false;
  }

  const ip = extractClientIpFromHeaders(await headers());
  try {
    await limiter.check(5, ip);
    return false;
  } catch {
    return true;
  }
};
