/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import 'server-only';

import { Ratelimit } from '@upstash/ratelimit';

import { limitWithFallback } from './redis-fallback';
import { getRedisClient } from './upstash-redis';

/**
 * An allowance counted over a rolling 24 hours: so many of something per
 * key. The submission limits are built on it (reports, approver notices,
 * attachment uploads), each as a named tier.
 */

const WINDOW = '24 h' as const;

/** The window in milliseconds, for the in-memory fallback limiter. */
export const DAILY_ALLOWANCE_WINDOW_MS = 24 * 60 * 60 * 1000;

/** One allowance: its name and how many a key may spend in 24 hours. */
export interface DailyAllowanceTier {
  /** Names the limiter in Redis, in the fallback cache and in its warning. */
  name: string;
  limit: number;
}

const limiters = new Map<string, Ratelimit>();

/** The Upstash limiter for a tier, built on first use. Throws when Upstash is not configured. */
const limiterFor = ({ name, limit }: DailyAllowanceTier): Ratelimit => {
  const cached = limiters.get(name);
  if (cached) {
    return cached;
  }

  const limiter = new Ratelimit({
    redis: getRedisClient(),
    limiter: Ratelimit.slidingWindow(limit, WINDOW),
    analytics: false,
    prefix: name,
  });
  limiters.set(name, limiter);

  return limiter;
};

/**
 * Spend one of a tier's allowance for `key` and say whether there was one to
 * spend. Fails open on an Upstash outage: the tier is then held by a
 * per-process window ({@link limitWithFallback}), so nothing a user does is
 * blocked by a dependency being down.
 */
export const spendDailyAllowance = async (
  tier: DailyAllowanceTier,
  key: string
): Promise<boolean> => {
  const { success } = await limitWithFallback({
    name: tier.name,
    getLimiter: () => limiterFor(tier),
    key,
    limit: tier.limit,
    windowMs: DAILY_ALLOWANCE_WINDOW_MS,
  });

  return success;
};

/** Drop the limiter singletons. Testing aid only. */
export const resetDailyAllowancesForTesting = (): void => {
  limiters.clear();
};
