/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import {
  checkRedisHealth,
  REDIS_HEALTH_TIMEOUT_MS,
  REDIS_HEALTH_TTL_MS,
  resetRedisHealthForTesting,
} from './redis-health';

vi.mock('server-only', () => ({}));

const pingMock = vi.hoisted(() => vi.fn());
const getRedisClientMock = vi.hoisted(() => vi.fn());

vi.mock('@/lib/utils/upstash-redis', () => ({
  getRedisClient: getRedisClientMock,
}));

describe('checkRedisHealth', () => {
  beforeEach(() => {
    resetRedisHealthForTesting();
    pingMock.mockReset();
    getRedisClientMock.mockReset();
    getRedisClientMock.mockImplementation(() => ({ ping: pingMock }));
    vi.stubEnv('UPSTASH_REDIS_REST_URL', 'https://example.upstash.io');
    vi.stubEnv('UPSTASH_REDIS_REST_TOKEN', 'test-token');
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
    resetRedisHealthForTesting();
  });

  it('reports not configured without touching the client when the URL is missing', async () => {
    vi.stubEnv('UPSTASH_REDIS_REST_URL', '');

    const result = await checkRedisHealth();

    expect(result).toEqual({ status: 'not configured' });
    expect(getRedisClientMock).not.toHaveBeenCalled();
  });

  it('reports not configured when the token is missing', async () => {
    vi.stubEnv('UPSTASH_REDIS_REST_TOKEN', '');

    const result = await checkRedisHealth();

    expect(result.status).toBe('not configured');
  });

  it('reports connected with a latency on PONG', async () => {
    pingMock.mockResolvedValueOnce('PONG');

    const result = await checkRedisHealth();

    expect(result.status).toBe('connected');
    expect(result.latency).toEqual(expect.any(Number));
  });

  it('reports unavailable when the ping rejects', async () => {
    pingMock.mockRejectedValueOnce(new Error('Unauthorized'));

    const result = await checkRedisHealth();

    expect(result).toEqual({ status: 'unavailable' });
  });

  it('reports unavailable when the ping resolves with something other than PONG', async () => {
    pingMock.mockResolvedValueOnce('NOPE');

    const result = await checkRedisHealth();

    expect(result).toEqual({ status: 'unavailable' });
  });

  it('reports unavailable when the client cannot be constructed', async () => {
    getRedisClientMock.mockImplementationOnce(() => {
      throw new Error('boom');
    });

    const result = await checkRedisHealth();

    expect(result).toEqual({ status: 'unavailable' });
  });

  it('reports unavailable when the ping hangs past the timeout', async () => {
    vi.useFakeTimers();
    pingMock.mockReturnValueOnce(new Promise(() => {}));

    const pending = checkRedisHealth();
    await vi.advanceTimersByTimeAsync(REDIS_HEALTH_TIMEOUT_MS + 1);

    await expect(pending).resolves.toEqual({ status: 'unavailable' });
  });

  it('memoizes the result so a second call within the TTL does not ping again', async () => {
    pingMock.mockResolvedValue('PONG');

    await checkRedisHealth();
    await checkRedisHealth();

    expect(pingMock).toHaveBeenCalledTimes(1);
  });

  it('memoizes an unavailable result too', async () => {
    pingMock.mockRejectedValue(new Error('down'));

    await checkRedisHealth();
    await checkRedisHealth();

    expect(pingMock).toHaveBeenCalledTimes(1);
  });

  it('pings again once the TTL has elapsed', async () => {
    vi.useFakeTimers();
    pingMock.mockResolvedValue('PONG');

    await checkRedisHealth();
    vi.advanceTimersByTime(REDIS_HEALTH_TTL_MS + 1);
    await checkRedisHealth();

    expect(pingMock).toHaveBeenCalledTimes(2);
  });

  it('clears the memo for testing', async () => {
    pingMock.mockResolvedValue('PONG');

    await checkRedisHealth();
    resetRedisHealthForTesting();
    await checkRedisHealth();

    expect(pingMock).toHaveBeenCalledTimes(2);
  });
});
