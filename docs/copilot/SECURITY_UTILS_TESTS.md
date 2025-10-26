# Security Utilities Test Coverage

**Date:** October 23, 2025
**Purpose:** Comprehensive test coverage for account lockout and rate limiting utilities
**Test Files:**

- `/src/app/lib/utils/account-lockout.spec.ts` (24 tests)
- `/src/app/lib/utils/rate-limit.spec.ts` (16 tests)

---

## Overview

Added comprehensive test suites for two critical security utilities:

1. **Account Lockout** - Prevents brute force attacks by locking accounts after failed login attempts
2. **Rate Limiting** - Protects API endpoints from abuse by limiting request frequency

## Test Coverage Summary

### Account Lockout Tests (24 tests)

**File:** `/src/app/lib/utils/account-lockout.spec.ts`

#### Test Groups

1. **`checkAccountLockout` (5 tests)**
   - Returns not locked when user doesn't exist
   - Returns not locked when user has no lockout
   - Returns locked with remaining time when account is locked
   - Resets lockout when lockout period has expired
   - Does not reset if lockout expired but attempts already 0

2. **`recordFailedLogin` (7 tests)**
   - Returns not locked when user doesn't exist
   - Increments failed attempts without locking (attempts 1-4)
   - Locks account on 5th failed attempt
   - Handles undefined failedLoginAttempts as 0
   - Continues incrementing after threshold (6th+ attempt)

3. **`resetFailedLogins` (2 tests)**
   - Resets failed login attempts and lockout
   - Handles multiple resets

4. **`formatLockoutTime` (7 tests)**
   - Formats 1 minute correctly (singular)
   - Formats multiple minutes correctly (plural)
   - Formats 15 minutes correctly
   - Rounds up partial minutes
   - Handles very small values
   - Handles large values
   - Handles zero

5. **Integration Scenarios (3 tests)**
   - Handles complete lockout flow (5 failed attempts → locked)
   - Handles check after lockout
   - Handles successful login after failed attempts

#### Key Test Patterns

```typescript
// Mock Prisma client
vi.mock('@/app/lib/prisma', () => ({
  prisma: {
    user: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
  },
}));

// Test pattern: Check if user is locked
it('should return locked with remaining time when account is locked', async () => {
  const futureDate = new Date(Date.now() + 10 * 60 * 1000);
  vi.mocked(prisma.user.findUnique).mockResolvedValue({
    lockedUntil: futureDate,
    failedLoginAttempts: 5,
  } as never);

  const result = await checkAccountLockout('locked@example.com');

  expect(result.isLocked).toBe(true);
  expect(result.remainingTime).toBeGreaterThan(0);
});
```

#### Configuration Tested

- **MAX_ATTEMPTS:** 5 failed logins before lockout
- **LOCKOUT_DURATION:** 15 minutes (900,000ms)
- **Automatic Reset:** Lockout expires after duration

### Rate Limit Tests (16 tests)

**File:** `/src/app/lib/utils/rate-limit.spec.ts`

#### Test Groups

1. **`rateLimit` (7 tests)**
   - Allows requests within limit
   - Rejects requests exceeding limit
   - Tracks different tokens independently
   - Handles zero limit (always rejects)
   - Handles high limit (100+ requests)
   - Handles concurrent requests from same token
   - Uses configured interval and token limit

2. **Real-World Scenarios (4 tests)**
   - API rate limiting scenario (10 requests/minute)
   - Login attempt rate limiting (5 attempts/15 minutes)
   - Multiple users accessing API independently
   - Burst traffic handling

3. **Edge Cases (5 tests)**
   - Empty token string
   - Very long token strings (1000 characters)
   - Special characters in tokens (emails, IPs)
   - Limit of 1
   - Separate counters for different limiter instances

#### Key Test Patterns

```typescript
// Test pattern: Basic rate limiting
it('should allow requests within limit', async () => {
  const limiter = rateLimit({
    interval: 60000, // 1 minute
    uniqueTokenPerInterval: 500,
  });

  const token = '192.168.1.1';

  // Should allow 3 requests if limit is 3
  await expect(limiter.check(3, token)).resolves.toBeUndefined();
  await expect(limiter.check(3, token)).resolves.toBeUndefined();
  await expect(limiter.check(3, token)).resolves.toBeUndefined();
});

// Test pattern: Exceeding limit
it('should reject requests exceeding limit', async () => {
  const limiter = rateLimit({
    interval: 60000,
    uniqueTokenPerInterval: 500,
  });

  const token = '192.168.1.2';

  await limiter.check(2, token);
  await limiter.check(2, token);

  // This should be rejected
  await expect(limiter.check(2, token)).rejects.toThrow('Rate limit exceeded');
});
```

#### Configuration Tested

- **Intervals:** 30 seconds, 60 seconds, 15 minutes
- **Token Limits:** 2, 100, 500, 1000 unique tokens
- **Request Limits:** 0, 1, 2, 5, 10, 100+ requests
- **LRU Cache:** Uses `lru-cache` with TTL expiration

## Testing Strategy

### Mocking Approach

**Account Lockout:**

- Mocks `@/app/lib/prisma` module
- Uses `as never` type assertion to bypass strict Prisma types while maintaining test clarity
- Mocks only the fields returned by `select` queries

**Rate Limiting:**

- No mocking required (uses real LRU cache)
- Tests real cache behavior and TTL
- Note: Tests don't use fake timers because LRU cache uses system time

### Test Organization

```
describe('module-name', () => {
  beforeEach(() => {
    vi.clearAllMocks(); // Only for mocked tests
  });

  describe('function-name', () => {
    it('should do specific thing', async () => {
      // Arrange
      // Act
      // Assert
    });
  });

  describe('integration scenarios', () => {
    it('should handle real-world flow', async () => {
      // Complex multi-step scenarios
    });
  });

  describe('edge cases', () => {
    it('should handle unusual input', async () => {
      // Boundary conditions
    });
  });
});
```

## Coverage Highlights

### Account Lockout

✅ **User States:**

- Non-existent users
- Users with no failed attempts
- Users with 1-4 failed attempts
- Users at threshold (5 attempts)
- Users beyond threshold (6+ attempts)
- Users with expired lockout
- Users with active lockout

✅ **Time Handling:**

- Future dates (active lockout)
- Past dates (expired lockout)
- Lockout duration calculation
- Time formatting (singular/plural, rounding)

✅ **Database Operations:**

- Finding users
- Updating failed attempt counters
- Setting lockedUntil timestamps
- Resetting lockout state

### Rate Limiting

✅ **Token Tracking:**

- Single token with multiple requests
- Multiple tokens independently
- Empty tokens
- Long tokens (1000 chars)
- Special character tokens

✅ **Limit Variations:**

- Zero limit (always reject)
- Limit of 1
- Normal limits (2-10)
- High limits (100+)

✅ **Concurrency:**

- Concurrent requests from same token
- Multiple users simultaneously
- Burst traffic patterns

✅ **Real-World Scenarios:**

- API rate limiting (10/min)
- Login attempts (5/15min)
- Multi-user access patterns

## Running Tests

```bash
# Run both test suites
npm test -- --run src/app/lib/utils/account-lockout.spec.ts src/app/lib/utils/rate-limit.spec.ts

# Run only account lockout tests
npm test -- --run src/app/lib/utils/account-lockout.spec.ts

# Run only rate limit tests
npm test -- --run src/app/lib/utils/rate-limit.spec.ts

# Watch mode for development
npm test -- src/app/lib/utils/account-lockout.spec.ts
```

## Test Results

```
✓ |boudreaux| src/app/lib/utils/account-lockout.spec.ts (24)
✓ |boudreaux| src/app/lib/utils/rate-limit.spec.ts (16)

Test Files  2 passed (2)
     Tests  40 passed (40)
Type Errors  no errors
```

## Maintenance Notes

### Account Lockout

1. **Constants:** If `MAX_ATTEMPTS` or `LOCKOUT_DURATION_MS` change in the source, update corresponding test expectations
2. **Database Schema:** Tests assume Prisma User model has `failedLoginAttempts` and `lockedUntil` fields
3. **Type Safety:** Uses `as never` for partial mock data - alternative is creating full User objects

### Rate Limiting

1. **LRU Cache Behavior:** Tests rely on real LRU cache TTL behavior
2. **Timer Mocking:** Cannot use `vi.useFakeTimers()` with LRU cache
3. **Token Uniqueness:** Tests use unique IP addresses/tokens to avoid cache collisions between tests

## Future Enhancements

- [ ] Add performance benchmarks for rate limiting
- [ ] Test account lockout with concurrent failed logins
- [ ] Test rate limiter cache eviction edge cases
- [ ] Add integration tests with actual Prisma database
- [ ] Test error handling for database failures
- [ ] Add tests for IPv6 addresses in rate limiting
- [ ] Test lockout behavior across timezone boundaries

## Related Files

- `/src/app/lib/utils/account-lockout.ts` - Account lockout implementation
- `/src/app/lib/utils/rate-limit.ts` - Rate limiting implementation
- `/prisma/schema.prisma` - User model with security fields
- `/docs/copilot/SECURITY_UTILS_TESTS.md` - This document

---

**Status:** ✅ Complete
**Test Coverage:** 40/40 tests passing
**Type Safety:** No TypeScript errors
**Lint Status:** Clean
