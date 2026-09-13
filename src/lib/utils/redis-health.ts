/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import 'server-only';

import { getRedisClient } from './upstash-redis';

export type RedisHealthStatus = 'connected' | 'unavailable' | 'not configured';

export interface RedisHealthResult {
  status: RedisHealthStatus;
  /** Round-trip of the PING in ms; only present when connected. */
  latency?: number;
}

/** Give up on the PING after this long — a hung Redis must not stall health. */
export const REDIS_HEALTH_TIMEOUT_MS = 1_500;

/**
 * How long one PING result is reused. `/api/health` is public and guarded
 * only by a per-IP in-memory limit, so an un-memoized PING would let a
 * single scanner burn more Upstash commands per day than the free tier
 * allows. Five minutes caps the endpoint at ≤288 PINGs/day regardless of
 * traffic, and a stale-by-minutes status is fine for a non-critical
 * dependency.
 */
export const REDIS_HEALTH_TTL_MS = 5 * 60_000;

interface MemoizedHealth {
  result: RedisHealthResult;
  checkedAt: number;
}

let memo: MemoizedHealth | null = null;

const isConfigured = (): boolean =>
  Boolean(process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN);

const TIMED_OUT = Symbol('redis-ping-timeout');

const pingWithTimeout = async (): Promise<RedisHealthResult> => {
  const start = Date.now();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<typeof TIMED_OUT>((resolve) => {
    timer = setTimeout(() => resolve(TIMED_OUT), REDIS_HEALTH_TIMEOUT_MS);
  });
  try {
    const outcome = await Promise.race([getRedisClient().ping(), timeout]);
    return outcome === 'PONG'
      ? { status: 'connected', latency: Date.now() - start }
      : { status: 'unavailable' };
  } catch {
    return { status: 'unavailable' };
  } finally {
    clearTimeout(timer);
  }
};

/**
 * Cheap Redis reachability signal for `/api/health`. Never throws and
 * never affects the HTTP status — Mongo remains the only 500 trigger.
 *
 * `'not configured'` when either env var is empty (no client is built);
 * otherwise one `PING` raced against {@link REDIS_HEALTH_TIMEOUT_MS},
 * memoized for {@link REDIS_HEALTH_TTL_MS}.
 */
export const checkRedisHealth = async (): Promise<RedisHealthResult> => {
  if (!isConfigured()) return { status: 'not configured' };
  if (memo && Date.now() - memo.checkedAt < REDIS_HEALTH_TTL_MS) return memo.result;

  const result = await pingWithTimeout();
  memo = { result, checkedAt: Date.now() };
  return result;
};

/** Clear the memoized result — testing aid only. */
export const resetRedisHealthForTesting = (): void => {
  memo = null;
};
