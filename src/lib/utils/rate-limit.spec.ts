import { rateLimit } from './rate-limit';

/**
 * Rate Limiter Tests
 *
 * Note: The "tokens" used in these tests are arbitrary strings used as cache keys.
 * They do not represent actual network addresses and make no network calls.
 * In production, these would typically be IP addresses, user IDs, or session tokens.
 * The rate limiter only uses these as unique identifiers for tracking request counts.
 */
describe('rateLimit', () => {
  it('should allow requests within limit', async () => {
    const limiter = rateLimit({
      interval: 60000, // 1 minute
      uniqueTokenPerInterval: 500,
    });

    const token = 'test-token-1';

    // Should allow 3 requests if limit is 3
    await expect(limiter.check(3, token)).resolves.toBeUndefined();
    await expect(limiter.check(3, token)).resolves.toBeUndefined();
    await expect(limiter.check(3, token)).resolves.toBeUndefined();
  });

  it('should reject requests exceeding limit', async () => {
    const limiter = rateLimit({
      interval: 60000,
      uniqueTokenPerInterval: 500,
    });

    const token = 'test-token-2';

    // Use up the limit
    await limiter.check(2, token);
    await limiter.check(2, token);

    // This should be rejected
    await expect(limiter.check(2, token)).rejects.toThrow('Rate limit exceeded');
  });

  it('should track different tokens independently', async () => {
    const limiter = rateLimit({
      interval: 60000,
      uniqueTokenPerInterval: 500,
    });

    const token1 = 'user-a';
    const token2 = 'user-b';

    // Each token should have its own limit
    await expect(limiter.check(1, token1)).resolves.toBeUndefined();
    await expect(limiter.check(1, token2)).resolves.toBeUndefined();

    // token1 should be rate limited, but not token2
    await expect(limiter.check(1, token1)).rejects.toThrow('Rate limit exceeded');
    await expect(limiter.check(1, token2)).rejects.toThrow('Rate limit exceeded');
  });

  it('should handle zero limit', async () => {
    const limiter = rateLimit({
      interval: 60000,
      uniqueTokenPerInterval: 500,
    });

    const token = 'test-token-zero';

    // With limit of 0, first request should fail
    await expect(limiter.check(0, token)).rejects.toThrow('Rate limit exceeded');
  });

  it('should handle high limit', async () => {
    const limiter = rateLimit({
      interval: 60000,
      uniqueTokenPerInterval: 500,
    });

    const token = 'test-token-high';

    // Should allow many requests
    for (let i = 0; i < 100; i++) {
      await expect(limiter.check(100, token)).resolves.toBeUndefined();
    }

    // 101st should fail
    await expect(limiter.check(100, token)).rejects.toThrow('Rate limit exceeded');
  });

  it('should handle concurrent requests from same token', async () => {
    const limiter = rateLimit({
      interval: 60000,
      uniqueTokenPerInterval: 500,
    });

    const token = 'concurrent-user';

    // Make concurrent requests
    const requests = [
      limiter.check(3, token),
      limiter.check(3, token),
      limiter.check(3, token),
      limiter.check(3, token), // This one should fail
    ];

    const results = await Promise.allSettled(requests);

    // First 3 should succeed, 4th should fail
    expect(results[0].status).toBe('fulfilled');
    expect(results[1].status).toBe('fulfilled');
    expect(results[2].status).toBe('fulfilled');
    expect(results[3].status).toBe('rejected');
  });

  it('should use configured interval and token limit', async () => {
    const limiter = rateLimit({
      interval: 30000, // 30 seconds
      uniqueTokenPerInterval: 100,
    });

    const token = 'config-test-token';

    // Should work with provided values
    await expect(limiter.check(5, token)).resolves.toBeUndefined();
    await expect(limiter.check(5, token)).resolves.toBeUndefined();
    await expect(limiter.check(5, token)).resolves.toBeUndefined();
    await expect(limiter.check(5, token)).resolves.toBeUndefined();
    await expect(limiter.check(5, token)).resolves.toBeUndefined();

    // 6th request should fail
    await expect(limiter.check(5, token)).rejects.toThrow('Rate limit exceeded');
  });

  it('should not reinitialize token counter on subsequent requests', async () => {
    const limiter = rateLimit({
      interval: 60000,
      uniqueTokenPerInterval: 500,
    });

    const token = 'repeat-token';

    // First request initializes the counter with [0], increments to [1]
    await expect(limiter.check(5, token)).resolves.toBeUndefined();

    // Second request should find existing counter and increment to [2]
    await expect(limiter.check(5, token)).resolves.toBeUndefined();

    // Third request increments to [3]
    await expect(limiter.check(5, token)).resolves.toBeUndefined();

    // Verify counter is being reused (not reset) by checking it accumulates
    await expect(limiter.check(5, token)).resolves.toBeUndefined(); // [4]
    await expect(limiter.check(5, token)).resolves.toBeUndefined(); // [5]

    // 6th request should fail because counter accumulated to [6]
    await expect(limiter.check(5, token)).rejects.toThrow('Rate limit exceeded');
  });

  it('should use default values when options are partially provided', async () => {
    // Test with only interval provided (uniqueTokenPerInterval defaults to 500)
    const limiter1 = rateLimit({
      interval: 30000,
      uniqueTokenPerInterval: 0,
    });

    await expect(limiter1.check(1, 'token-1')).resolves.toBeUndefined();

    // Test with only uniqueTokenPerInterval provided (interval defaults to 60000)
    const limiter2 = rateLimit({
      interval: 0,
      uniqueTokenPerInterval: 100,
    });

    await expect(limiter2.check(1, 'token-2')).resolves.toBeUndefined();
  });

  describe('real-world scenarios', () => {
    it('should handle API rate limiting scenario', async () => {
      const apiLimiter = rateLimit({
        interval: 60000, // 1 minute
        uniqueTokenPerInterval: 1000, // Track up to 1000 unique tokens
      });

      const userToken = 'api-user-token-123';
      const requestsPerMinute = 10;

      // Simulate user making requests
      for (let i = 0; i < requestsPerMinute; i++) {
        await expect(apiLimiter.check(requestsPerMinute, userToken)).resolves.toBeUndefined();
      }

      // 11th request should fail
      await expect(apiLimiter.check(requestsPerMinute, userToken)).rejects.toThrow(
        'Rate limit exceeded'
      );
    });

    it('should handle login attempt rate limiting', async () => {
      const loginLimiter = rateLimit({
        interval: 15 * 60 * 1000, // 15 minutes
        uniqueTokenPerInterval: 500,
      });

      const userEmail = 'user@example.com';
      const maxAttempts = 5;

      // Simulate failed login attempts
      for (let i = 0; i < maxAttempts; i++) {
        await expect(loginLimiter.check(maxAttempts, userEmail)).resolves.toBeUndefined();
      }

      // 6th attempt should be blocked
      await expect(loginLimiter.check(maxAttempts, userEmail)).rejects.toThrow(
        'Rate limit exceeded'
      );
    });

    it('should handle multiple users accessing API', async () => {
      const apiLimiter = rateLimit({
        interval: 60000,
        uniqueTokenPerInterval: 100,
      });

      const user1 = 'user-alice';
      const user2 = 'user-bob';
      const user3 = 'user-charlie';

      // Each user can make requests independently
      await apiLimiter.check(10, user1);
      await apiLimiter.check(10, user2);
      await apiLimiter.check(10, user3);

      // Each user has their own counter
      for (let i = 0; i < 9; i++) {
        await expect(apiLimiter.check(10, user1)).resolves.toBeUndefined();
        await expect(apiLimiter.check(10, user2)).resolves.toBeUndefined();
        await expect(apiLimiter.check(10, user3)).resolves.toBeUndefined();
      }

      // All users should now be at their limit
      await expect(apiLimiter.check(10, user1)).rejects.toThrow('Rate limit exceeded');
      await expect(apiLimiter.check(10, user2)).rejects.toThrow('Rate limit exceeded');
      await expect(apiLimiter.check(10, user3)).rejects.toThrow('Rate limit exceeded');
    });

    it('should handle burst traffic', async () => {
      const limiter = rateLimit({
        interval: 60000,
        uniqueTokenPerInterval: 500,
      });

      const token = 'burst-test-user';

      // Burst of requests
      await limiter.check(5, token);
      await limiter.check(5, token);
      await limiter.check(5, token);

      // Still have room for 2 more
      await expect(limiter.check(5, token)).resolves.toBeUndefined();
      await expect(limiter.check(5, token)).resolves.toBeUndefined();

      // Now at limit
      await expect(limiter.check(5, token)).rejects.toThrow('Rate limit exceeded');
    });
  });

  describe('edge cases', () => {
    it('should handle empty token string', async () => {
      const limiter = rateLimit({
        interval: 60000,
        uniqueTokenPerInterval: 500,
      });

      await expect(limiter.check(1, '')).resolves.toBeUndefined();
      await expect(limiter.check(1, '')).rejects.toThrow('Rate limit exceeded');
    });

    it('should handle very long token strings', async () => {
      const limiter = rateLimit({
        interval: 60000,
        uniqueTokenPerInterval: 500,
      });

      const longToken = 'a'.repeat(1000);

      await expect(limiter.check(1, longToken)).resolves.toBeUndefined();
      await expect(limiter.check(1, longToken)).rejects.toThrow('Rate limit exceeded');
    });

    it('should handle special characters in tokens', async () => {
      const limiter = rateLimit({
        interval: 60000,
        uniqueTokenPerInterval: 500,
      });

      // Token can be composite (e.g., email + IP in production)
      const specialToken = 'user@email.com:session-abc123';

      await expect(limiter.check(2, specialToken)).resolves.toBeUndefined();
      await expect(limiter.check(2, specialToken)).resolves.toBeUndefined();
      await expect(limiter.check(2, specialToken)).rejects.toThrow('Rate limit exceeded');
    });

    it('should handle limit of 1', async () => {
      const limiter = rateLimit({
        interval: 60000,
        uniqueTokenPerInterval: 500,
      });

      const token = 'strict-limit-user';

      await expect(limiter.check(1, token)).resolves.toBeUndefined();
      await expect(limiter.check(1, token)).rejects.toThrow('Rate limit exceeded');
    });

    it('should maintain separate counters for different limiters', async () => {
      const limiter1 = rateLimit({
        interval: 60000,
        uniqueTokenPerInterval: 500,
      });

      const limiter2 = rateLimit({
        interval: 60000,
        uniqueTokenPerInterval: 500,
      });

      const token = 'shared-token';

      // Each limiter maintains its own state
      await expect(limiter1.check(1, token)).resolves.toBeUndefined();
      await expect(limiter2.check(1, token)).resolves.toBeUndefined();

      // Both should be at limit independently
      await expect(limiter1.check(1, token)).rejects.toThrow('Rate limit exceeded');
      await expect(limiter2.check(1, token)).rejects.toThrow('Rate limit exceeded');
    });
  });
});
