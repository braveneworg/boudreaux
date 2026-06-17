/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import 'server-only';

import { Ratelimit } from '@upstash/ratelimit';

import { getRedisClient } from './upstash-redis';

/** Hard ceiling on chat sends per device per rolling minute. */
export const CHAT_RATE_LIMIT_PER_MINUTE = 10;

/**
 * Threshold at which a sender is auto-flagged for review. Set just below
 * the hard limit so users repeatedly bumping against the ceiling surface
 * in the admin moderation panel before they get 429s.
 */
export const CHAT_FLAG_THRESHOLD = 8;

let cachedLimiter: Ratelimit | null = null;

const getLimiter = (): Ratelimit => {
  if (cachedLimiter) return cachedLimiter;
  cachedLimiter = new Ratelimit({
    redis: getRedisClient(),
    limiter: Ratelimit.slidingWindow(CHAT_RATE_LIMIT_PER_MINUTE, '60 s'),
    analytics: false,
    prefix: 'chat',
  });
  return cachedLimiter;
};

export interface ChatRateLimitResult {
  /** Whether the request is allowed. */
  success: boolean;
  /** Remaining attempts in the current window. */
  remaining: number;
  /** Unix-ms timestamp when the current window resets. */
  reset: number;
  /** Seconds until the window resets — convenient for Retry-After headers. */
  retryAfterSeconds: number;
}

/**
 * Check whether a chat send is permitted for the given user + device + IP.
 *
 * The key includes `userId` (server-trusted from `auth()`) so the limit
 * is enforced per-account first, and only secondarily by fingerprint
 * and IP. Without `userId` the bucket would be fully client-controlled:
 * an attacker could pin a constant fingerprint to ride someone else's
 * bucket, or rotate fingerprints to evade their own. The fingerprint +
 * IP remain on the key so a single user using many tabs / devices
 * still fans out instead of stacking, and so the audit log
 * (ChatRateLimitLog) can attribute breaches to a device.
 *
 * Skipped entirely in E2E mode to keep test suites deterministic.
 */
export const checkChatRateLimit = async (
  userId: string,
  fingerprint: string,
  ip: string
): Promise<ChatRateLimitResult> => {
  if (process.env.E2E_MODE === 'true') {
    return {
      success: true,
      remaining: CHAT_RATE_LIMIT_PER_MINUTE,
      reset: Date.now() + 60_000,
      retryAfterSeconds: 0,
    };
  }

  const key = `${userId}:${fingerprint}:${ip}`;
  const { success, remaining, reset } = await getLimiter().limit(key);
  const retryAfterSeconds = Math.max(0, Math.ceil((reset - Date.now()) / 1000));

  return { success, remaining, reset, retryAfterSeconds };
};

/** Reset the limiter singleton — testing aid only. */
export const resetChatRateLimitForTesting = (): void => {
  cachedLimiter = null;
};
