/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
import 'server-only';

import { Ratelimit } from '@upstash/ratelimit';

import { getRedisClient } from './upstash-redis';

/**
 * Per (reporter, target) pair: max 3 reports per rolling 24h window.
 * Subsumes the per-session limit from the original spec — a session
 * limit is redundant when this cross-session limit is in force.
 */
export const ABUSE_REPORT_PAIR_LIMIT = 3;
export const ABUSE_REPORT_PAIR_WINDOW = '24 h' as const;

/**
 * Global per-reporter: max 10 reports per rolling 24h window. Prevents
 * one user mass-reporting many distinct targets in a short period.
 */
export const ABUSE_REPORT_GLOBAL_LIMIT = 10;
export const ABUSE_REPORT_GLOBAL_WINDOW = '24 h' as const;

let cachedPairLimiter: Ratelimit | null = null;
let cachedGlobalLimiter: Ratelimit | null = null;

const getPairLimiter = (): Ratelimit => {
  if (cachedPairLimiter) return cachedPairLimiter;
  cachedPairLimiter = new Ratelimit({
    redis: getRedisClient(),
    limiter: Ratelimit.slidingWindow(ABUSE_REPORT_PAIR_LIMIT, ABUSE_REPORT_PAIR_WINDOW),
    analytics: false,
    prefix: 'abuse-report:pair',
  });
  return cachedPairLimiter;
};

const getGlobalLimiter = (): Ratelimit => {
  if (cachedGlobalLimiter) return cachedGlobalLimiter;
  cachedGlobalLimiter = new Ratelimit({
    redis: getRedisClient(),
    limiter: Ratelimit.slidingWindow(ABUSE_REPORT_GLOBAL_LIMIT, ABUSE_REPORT_GLOBAL_WINDOW),
    analytics: false,
    prefix: 'abuse-report:global',
  });
  return cachedGlobalLimiter;
};

export type AbuseReportRateLimitTier = 'pair' | 'global';

export interface AbuseReportRateLimitResult {
  /** True when *all* tiers permit the report. */
  success: boolean;
  /** Which tier denied — `null` when {@link success} is true. */
  blockedBy: AbuseReportRateLimitTier | null;
  /** Seconds until the relevant window resets (best-effort, may be 0). */
  retryAfterSeconds: number;
}

/**
 * Layered abuse-report rate limit. The pair tier is checked first so
 * the most common abuse pattern (repeatedly reporting the same target)
 * is caught early; the global tier catches scattershot abuse across
 * many targets.
 *
 * Skipped entirely in E2E mode (`E2E_MODE=true`) to keep deterministic
 * Playwright runs from tripping production-grade limits.
 */
export const checkAbuseReportRateLimit = async (params: {
  reporterId: string;
  reportedUserId: string;
}): Promise<AbuseReportRateLimitResult> => {
  if (process.env.E2E_MODE === 'true') {
    return { success: true, blockedBy: null, retryAfterSeconds: 0 };
  }

  const pairKey = `${params.reporterId}:${params.reportedUserId}`;
  const pair = await getPairLimiter().limit(pairKey);
  if (!pair.success) {
    return {
      success: false,
      blockedBy: 'pair',
      retryAfterSeconds: Math.max(0, Math.ceil((pair.reset - Date.now()) / 1000)),
    };
  }

  const global = await getGlobalLimiter().limit(params.reporterId);
  if (!global.success) {
    return {
      success: false,
      blockedBy: 'global',
      retryAfterSeconds: Math.max(0, Math.ceil((global.reset - Date.now()) / 1000)),
    };
  }

  return { success: true, blockedBy: null, retryAfterSeconds: 0 };
};

/** Reset both limiter singletons — testing aid only. */
export const resetAbuseReportRateLimitForTesting = (): void => {
  cachedPairLimiter = null;
  cachedGlobalLimiter = null;
};
