/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import {
  limitWithFallback,
  REDIS_FALLBACK_COOLDOWN_MS,
  resetRedisFallbackForTesting,
  type RedisLimiterLike,
} from './redis-fallback';

vi.mock('server-only', () => ({}));

const warnMock = vi.hoisted(() => vi.fn());
const infoMock = vi.hoisted(() => vi.fn());
const debugMock = vi.hoisted(() => vi.fn());

vi.mock('@/lib/utils/logger', () => ({
  loggers: { redis: { warn: warnMock, info: infoMock, debug: debugMock } },
}));

const limitMock = vi.fn<RedisLimiterLike['limit']>();
const getLimiterMock = vi.fn<() => RedisLimiterLike>(() => ({ limit: limitMock }));

const upstashOk = { success: true, remaining: 7, reset: 1_700_000_000_000 };

const call = (overrides: Partial<Parameters<typeof limitWithFallback>[0]> = {}) =>
  limitWithFallback({
    name: 'chat',
    getLimiter: getLimiterMock,
    key: 'user-1',
    limit: 10,
    windowMs: 60_000,
    ...overrides,
  });

describe('limitWithFallback', () => {
  beforeEach(() => {
    resetRedisFallbackForTesting();
    limitMock.mockReset();
    getLimiterMock.mockReset();
    getLimiterMock.mockImplementation(() => ({ limit: limitMock }));
  });

  afterEach(() => {
    vi.useRealTimers();
    resetRedisFallbackForTesting();
  });

  it('passes the Upstash result through with degraded=false', async () => {
    limitMock.mockResolvedValueOnce(upstashOk);

    const result = await call();

    expect(result).toEqual({ ...upstashOk, degraded: false });
  });

  it('hands the key to the Upstash limiter', async () => {
    limitMock.mockResolvedValueOnce(upstashOk);

    await call({ key: 'user-9:fp:ip' });

    expect(limitMock).toHaveBeenCalledWith('user-9:fp:ip');
  });

  it('falls back to allow when the limiter factory throws synchronously', async () => {
    getLimiterMock.mockImplementationOnce(() => {
      throw new Error('Upstash Redis is not configured');
    });

    const result = await call();

    expect(result).toMatchObject({ success: true, remaining: 9, degraded: true });
  });

  it('falls back to allow when the Upstash call rejects', async () => {
    limitMock.mockRejectedValueOnce(new Error('Unauthorized'));

    const result = await call();

    expect(result).toMatchObject({ success: true, remaining: 9, degraded: true });
  });

  it('treats a timeout resolution as a failure and falls back', async () => {
    limitMock.mockResolvedValueOnce({ success: true, remaining: 0, reset: 0, reason: 'timeout' });

    const result = await call();

    expect(result).toMatchObject({ success: true, remaining: 9, degraded: true });
  });

  it('enforces the numeric limit in fallback mode', async () => {
    limitMock.mockRejectedValue(new Error('down'));

    await call({ limit: 2 });
    await call({ limit: 2 });
    const third = await call({ limit: 2 });

    expect(third).toMatchObject({ success: false, remaining: 0, degraded: true });
  });

  it('keeps fallback counters independent per key', async () => {
    limitMock.mockRejectedValue(new Error('down'));

    await call({ limit: 1, key: 'a' });
    const other = await call({ limit: 1, key: 'b' });

    expect(other.success).toBe(true);
  });

  it('keeps fallback counters independent per name', async () => {
    limitMock.mockRejectedValue(new Error('down'));

    await call({ limit: 1, name: 'chat' });
    const other = await call({ limit: 1, name: 'abuse-report:pair' });

    expect(other.success).toBe(true);
  });

  it('warns exactly once per name across repeated failures', async () => {
    limitMock.mockRejectedValue(new Error('down'));

    await call();
    await call();
    await call();

    expect(warnMock).toHaveBeenCalledTimes(1);
  });

  it('warns separately for each name', async () => {
    limitMock.mockRejectedValue(new Error('down'));

    await call({ name: 'chat' });
    await call({ name: 'abuse-report:global' });

    expect(warnMock).toHaveBeenCalledTimes(2);
  });

  it('never includes the Upstash URL or token in the warning', async () => {
    limitMock.mockRejectedValue(new Error('down'));

    await call();

    const [, meta] = warnMock.mock.calls[0];
    expect(JSON.stringify(meta)).not.toMatch(/upstash\.io|token/i);
  });

  it('redacts an Upstash host that leaks into the error message', async () => {
    limitMock.mockRejectedValue(new Error('fetch failed: https://abc-123.upstash.io/pipeline'));

    await call();

    const [, meta] = warnMock.mock.calls[0];
    expect(JSON.stringify(meta)).not.toContain('abc-123.upstash.io');
  });

  it('skips Upstash during the cool-down after a failure', async () => {
    vi.useFakeTimers();
    limitMock.mockRejectedValueOnce(new Error('down'));

    await call();
    await call();

    expect(getLimiterMock).toHaveBeenCalledTimes(1);
  });

  it('retries Upstash once the cool-down has elapsed', async () => {
    vi.useFakeTimers();
    limitMock.mockRejectedValueOnce(new Error('down'));
    limitMock.mockResolvedValueOnce(upstashOk);

    await call();
    vi.advanceTimersByTime(REDIS_FALLBACK_COOLDOWN_MS + 1);
    const result = await call();

    expect(result).toEqual({ ...upstashOk, degraded: false });
  });

  it('logs recovery and re-arms the warning after Upstash comes back', async () => {
    vi.useFakeTimers();
    limitMock.mockRejectedValueOnce(new Error('down'));
    limitMock.mockResolvedValueOnce(upstashOk);
    limitMock.mockRejectedValueOnce(new Error('down again'));

    await call();
    vi.advanceTimersByTime(REDIS_FALLBACK_COOLDOWN_MS + 1);
    await call();
    vi.advanceTimersByTime(REDIS_FALLBACK_COOLDOWN_MS + 1);
    await call();

    expect(infoMock).toHaveBeenCalledTimes(1);
    expect(warnMock).toHaveBeenCalledTimes(2);
  });

  it('does not log recovery when Upstash never failed', async () => {
    limitMock.mockResolvedValue(upstashOk);

    await call();
    await call();

    expect(infoMock).not.toHaveBeenCalled();
  });

  it('resets cool-down, counters, and warning state for testing', async () => {
    vi.useFakeTimers();
    limitMock.mockRejectedValue(new Error('down'));

    await call({ limit: 1 });
    resetRedisFallbackForTesting();
    const result = await call({ limit: 1 });

    expect(result.success).toBe(true);
    expect(getLimiterMock).toHaveBeenCalledTimes(2);
    expect(warnMock).toHaveBeenCalledTimes(2);
  });
});
