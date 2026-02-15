/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { LRUCache } from 'lru-cache';

export type RateLimitOptions = {
  interval: number; // Time window in ms
  uniqueTokenPerInterval: number; // Max unique tokens (IPs) to track
};

/**
 * Creates a rate limiter using LRU cache
 * @param options Configuration for rate limiting
 * @returns Object with check method to verify rate limits
 */
export function rateLimit(options: RateLimitOptions) {
  const tokenCache = new LRUCache<string, number[]>({
    max: options.uniqueTokenPerInterval || 500,
    ttl: options.interval || 60000,
  });

  return {
    /**
     * Check if a token (typically IP address) has exceeded the rate limit
     * @param limit Maximum number of requests allowed
     * @param token Unique identifier (usually IP address)
     * @returns Promise that resolves if within limit, rejects if rate limited
     */
    check: (limit: number, token: string): Promise<void> =>
      new Promise<void>((resolve, reject) => {
        const tokenCount = tokenCache.get(token) || [0];

        if (tokenCount[0] === 0) {
          tokenCache.set(token, tokenCount);
        }

        tokenCount[0] += 1;

        const currentUsage = tokenCount[0];
        const isRateLimited = currentUsage > limit;

        return isRateLimited ? reject(Error('Rate limit exceeded')) : resolve();
      }),
  };
}
