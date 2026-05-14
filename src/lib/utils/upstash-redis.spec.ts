/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { Redis } from '@upstash/redis';

import { getRedisClient, resetRedisClientForTesting } from './upstash-redis';

vi.mock('server-only', () => ({}));

vi.mock('@upstash/redis', () => ({
  Redis: vi.fn(),
}));

const RedisMock = vi.mocked(Redis);

describe('getRedisClient', () => {
  beforeEach(() => {
    resetRedisClientForTesting();
    RedisMock.mockClear();
    vi.stubEnv('UPSTASH_REDIS_REST_URL', 'https://example.upstash.io');
    vi.stubEnv('UPSTASH_REDIS_REST_TOKEN', 'test-token');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    resetRedisClientForTesting();
  });

  it('constructs a Redis client with env credentials', () => {
    getRedisClient();
    expect(RedisMock).toHaveBeenCalledWith({
      url: 'https://example.upstash.io',
      token: 'test-token',
    });
  });

  it('returns the cached singleton on subsequent calls', () => {
    getRedisClient();
    getRedisClient();
    getRedisClient();
    expect(RedisMock).toHaveBeenCalledTimes(1);
  });

  it('throws when UPSTASH_REDIS_REST_URL is missing', () => {
    vi.stubEnv('UPSTASH_REDIS_REST_URL', '');
    expect(() => getRedisClient()).toThrow(/Upstash Redis is not configured/);
  });

  it('throws when UPSTASH_REDIS_REST_TOKEN is missing', () => {
    vi.stubEnv('UPSTASH_REDIS_REST_TOKEN', '');
    expect(() => getRedisClient()).toThrow(/Upstash Redis is not configured/);
  });
});
