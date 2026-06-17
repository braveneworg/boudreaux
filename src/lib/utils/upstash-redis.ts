/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import 'server-only';

import { Redis } from '@upstash/redis';

let cachedClient: Redis | null = null;

/**
 * Singleton accessor for the Upstash REST Redis client.
 *
 * Lazy-initialized so build-time imports do not throw when env vars are
 * absent (CI test runs, Docker build phase). The first runtime caller in
 * a process pays the construction cost; everyone else reuses the cached
 * instance.
 */
export const getRedisClient = (): Redis => {
  if (cachedClient) {
    return cachedClient;
  }

  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;

  if (!url || !token) {
    throw Error(
      'Upstash Redis is not configured. Set UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN.'
    );
  }

  cachedClient = new Redis({ url, token });
  return cachedClient;
};

/** Reset the singleton — testing aid only. */
export const resetRedisClientForTesting = (): void => {
  cachedClient = null;
};
