/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import 'server-only';

import { loggers } from '@/lib/utils/logger';

import { rateLimit } from './rate-limit';

const logger = loggers.redis;

/**
 * After an Upstash failure, skip Upstash for this long and answer from the
 * in-memory limiter directly. The SDK's retry/timeout chain costs several
 * seconds per call during an outage; paying it on every chat send would
 * make the fallback feel like the outage it is meant to hide.
 */
export const REDIS_FALLBACK_COOLDOWN_MS = 30_000;

/** Distinct keys the in-memory fallback tracks per limiter name. */
const FALLBACK_UNIQUE_TOKENS = 500;

/** The subset of `@upstash/ratelimit`'s `limit()` response this helper reads. */
export interface RedisLimitResponse {
  success: boolean;
  remaining: number;
  /** Unix-ms */
  reset: number;
  /** `'timeout'` when the SDK gave up waiting and defaulted to success. */
  reason?: string;
}

/** Anything with an Upstash-shaped `limit(key)` — the `Ratelimit` instances. */
export interface RedisLimiterLike {
  limit: (key: string) => Promise<RedisLimitResponse>;
}

export interface FallbackLimitResult {
  success: boolean;
  remaining: number;
  /** Unix-ms */
  reset: number;
  /** True when the in-memory fallback answered instead of Upstash. */
  degraded: boolean;
}

export interface LimitWithFallbackParams {
  /** Stable limiter name — keys the fallback cache, cool-down, and warning. */
  name: string;
  /** May throw synchronously when Upstash is not configured. */
  getLimiter: () => RedisLimiterLike;
  key: string;
  limit: number;
  windowMs: number;
}

type InMemoryLimiter = ReturnType<typeof rateLimit>;

const fallbackLimiters = new Map<string, InMemoryLimiter>();
const degradedUntil = new Map<string, number>();
/** Names whose outage has been warned about and not yet recovered. */
const warnedNames = new Set<string>();

const fallbackFor = (name: string, windowMs: number): InMemoryLimiter => {
  const cached = fallbackLimiters.get(name);
  if (cached) return cached;
  const limiter = rateLimit({ interval: windowMs, uniqueTokenPerInterval: FALLBACK_UNIQUE_TOKENS });
  fallbackLimiters.set(name, limiter);
  return limiter;
};

const isCoolingDown = (name: string): boolean => {
  const until = degradedUntil.get(name);
  return until !== undefined && Date.now() < until;
};

/** Network errors can carry the Upstash host; never let it reach the logs. */
const describeError = (error: unknown): string =>
  (error instanceof Error ? error.message : String(error)).replace(
    /\S*\.upstash\.io\S*/g,
    '[upstash]'
  );

const noteFailure = (name: string, error: unknown): void => {
  degradedUntil.set(name, Date.now() + REDIS_FALLBACK_COOLDOWN_MS);
  const described = describeError(error);
  if (warnedNames.has(name)) {
    logger.debug('Upstash still unavailable — in-memory rate limit', { name, error: described });
    return;
  }
  warnedNames.add(name);
  logger.warn('Upstash unavailable — using in-memory rate limit', { name, error: described });
};

const noteRecovery = (name: string): void => {
  if (!warnedNames.has(name)) return;
  warnedNames.delete(name);
  degradedUntil.delete(name);
  logger.info('Upstash recovered — Redis rate limit restored', { name });
};

/** A `reason: 'timeout'` response is the SDK defaulting to success, not a verdict. */
const tryUpstash = async (
  getLimiter: () => RedisLimiterLike,
  key: string
): Promise<RedisLimitResponse> => {
  const response = await getLimiter().limit(key);
  if (response.reason === 'timeout') {
    throw new Error('Upstash limiter timed out');
  }
  return response;
};

/**
 * Run an Upstash sliding-window check, falling back to an in-memory limiter
 * with the same numeric limit whenever Upstash cannot answer — not
 * configured, HTTP/network failure, or the SDK's timeout default.
 *
 * Fail-open on the user action, never on the limit: the fallback still
 * enforces `limit` per `key` within this process. Per-instance state means
 * limits are not shared across containers or restarts while degraded — an
 * accepted trade-off for a non-critical dependency (single container today).
 *
 * A failure warns once per process per `name` (later failures log at debug)
 * and starts a {@link REDIS_FALLBACK_COOLDOWN_MS} cool-down during which
 * Upstash is not retried; the first success afterwards logs the recovery.
 */
export const limitWithFallback = async ({
  name,
  getLimiter,
  key,
  limit,
  windowMs,
}: LimitWithFallbackParams): Promise<FallbackLimitResult> => {
  if (isCoolingDown(name)) {
    return { ...fallbackFor(name, windowMs).consume(limit, key), degraded: true };
  }
  try {
    const { success, remaining, reset } = await tryUpstash(getLimiter, key);
    noteRecovery(name);
    return { success, remaining, reset, degraded: false };
  } catch (error) {
    noteFailure(name, error);
    return { ...fallbackFor(name, windowMs).consume(limit, key), degraded: true };
  }
};

/** Clear fallback limiters, cool-downs, and warning state — testing aid only. */
export const resetRedisFallbackForTesting = (): void => {
  fallbackLimiters.clear();
  degradedUntil.clear();
  warnedNames.clear();
};
