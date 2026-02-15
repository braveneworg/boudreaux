/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { prisma } from '@/lib/prisma';

import {
  checkAccountLockout,
  recordFailedLogin,
  resetFailedLogins,
  formatLockoutTime,
} from './account-lockout';

// Mock Prisma Client
vi.mock('@/lib/prisma', () => ({
  prisma: {
    user: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
  },
}));

describe('account-lockout', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('checkAccountLockout', () => {
    it('should return not locked when user does not exist', async () => {
      vi.mocked(prisma.user.findUnique).mockResolvedValue(null);

      const result = await checkAccountLockout('nonexistent@example.com');

      expect(result).toEqual({ isLocked: false });
      expect(prisma.user.findUnique).toHaveBeenCalledWith({
        where: { email: 'nonexistent@example.com' },
        select: { lockedUntil: true, failedLoginAttempts: true },
      });
    });

    it('should return not locked when user has no lockout', async () => {
      vi.mocked(prisma.user.findUnique).mockResolvedValue({
        lockedUntil: null,
        failedLoginAttempts: 0,
      } as never);

      const result = await checkAccountLockout('user@example.com');

      expect(result).toEqual({ isLocked: false });
    });

    it('should return locked with remaining time when account is locked', async () => {
      const futureDate = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes from now
      vi.mocked(prisma.user.findUnique).mockResolvedValue({
        lockedUntil: futureDate,
        failedLoginAttempts: 5,
      } as never);

      const result = await checkAccountLockout('locked@example.com');

      expect(result.isLocked).toBe(true);
      expect(result.remainingTime).toBeGreaterThan(0);
      expect(result.remainingTime).toBeLessThanOrEqual(10 * 60 * 1000);
    });

    it('should reset lockout when lockout period has expired', async () => {
      const pastDate = new Date(Date.now() - 1000); // 1 second ago
      vi.mocked(prisma.user.findUnique).mockResolvedValue({
        lockedUntil: pastDate,
        failedLoginAttempts: 5,
      } as never);

      const result = await checkAccountLockout('expired@example.com');

      expect(result).toEqual({ isLocked: false });
      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { email: 'expired@example.com' },
        data: {
          failedLoginAttempts: 0,
          lockedUntil: null,
        },
      });
    });

    it('should not reset if lockout is expired but attempts is already 0', async () => {
      const pastDate = new Date(Date.now() - 1000);
      vi.mocked(prisma.user.findUnique).mockResolvedValue({
        lockedUntil: pastDate,
        failedLoginAttempts: 0,
      } as never);

      const result = await checkAccountLockout('user@example.com');

      expect(result).toEqual({ isLocked: false });
      expect(prisma.user.update).not.toHaveBeenCalled();
    });
  });

  describe('recordFailedLogin', () => {
    it('should return not locked when user does not exist', async () => {
      vi.mocked(prisma.user.findUnique).mockResolvedValue(null);

      const result = await recordFailedLogin('nonexistent@example.com');

      expect(result).toEqual({ isLocked: false });
      expect(prisma.user.update).not.toHaveBeenCalled();
    });

    it('should increment failed attempts without locking (first attempt)', async () => {
      vi.mocked(prisma.user.findUnique).mockResolvedValue({
        failedLoginAttempts: 0,
      } as never);

      const result = await recordFailedLogin('user@example.com');

      expect(result).toEqual({ isLocked: false });
      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { email: 'user@example.com' },
        data: {
          failedLoginAttempts: 1,
          lockedUntil: null,
        },
      });
    });

    it('should increment failed attempts without locking (second attempt)', async () => {
      vi.mocked(prisma.user.findUnique).mockResolvedValue({
        failedLoginAttempts: 1,
      } as never);

      const result = await recordFailedLogin('user@example.com');

      expect(result).toEqual({ isLocked: false });
      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { email: 'user@example.com' },
        data: {
          failedLoginAttempts: 2,
          lockedUntil: null,
        },
      });
    });

    it('should increment failed attempts without locking (fourth attempt)', async () => {
      vi.mocked(prisma.user.findUnique).mockResolvedValue({
        failedLoginAttempts: 3,
      } as never);

      const result = await recordFailedLogin('user@example.com');

      expect(result).toEqual({ isLocked: false });
      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { email: 'user@example.com' },
        data: {
          failedLoginAttempts: 4,
          lockedUntil: null,
        },
      });
    });

    it('should lock account on 5th failed attempt', async () => {
      vi.mocked(prisma.user.findUnique).mockResolvedValue({
        failedLoginAttempts: 4,
      } as never);

      const beforeTime = Date.now();
      const result = await recordFailedLogin('user@example.com');
      const afterTime = Date.now();

      expect(result.isLocked).toBe(true);
      expect(result.remainingTime).toBe(15 * 60 * 1000); // 15 minutes

      const updateCall = vi.mocked(prisma.user.update).mock.calls[0][0];
      expect(updateCall.where).toEqual({ email: 'user@example.com' });
      expect(updateCall.data.failedLoginAttempts).toBe(5);

      // Verify lockedUntil is approximately 15 minutes from now
      const lockedUntil = updateCall.data.lockedUntil as Date;
      const lockedUntilTime = lockedUntil.getTime();
      const expectedMin = beforeTime + 15 * 60 * 1000;
      const expectedMax = afterTime + 15 * 60 * 1000;

      expect(lockedUntilTime).toBeGreaterThanOrEqual(expectedMin);
      expect(lockedUntilTime).toBeLessThanOrEqual(expectedMax);
    });

    it('should handle undefined failedLoginAttempts as 0', async () => {
      vi.mocked(prisma.user.findUnique).mockResolvedValue({
        failedLoginAttempts: undefined,
      } as never);

      const result = await recordFailedLogin('user@example.com');

      expect(result).toEqual({ isLocked: false });
      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { email: 'user@example.com' },
        data: {
          failedLoginAttempts: 1,
          lockedUntil: null,
        },
      });
    });

    it('should continue incrementing after threshold (6th attempt)', async () => {
      vi.mocked(prisma.user.findUnique).mockResolvedValue({
        failedLoginAttempts: 5,
      } as never);

      const result = await recordFailedLogin('user@example.com');

      expect(result.isLocked).toBe(true);
      expect(prisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { email: 'user@example.com' },
          data: expect.objectContaining({
            failedLoginAttempts: 6,
          }),
        })
      );
    });
  });

  describe('resetFailedLogins', () => {
    it('should reset failed login attempts and lockout', async () => {
      await resetFailedLogins('user@example.com');

      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { email: 'user@example.com' },
        data: {
          failedLoginAttempts: 0,
          lockedUntil: null,
        },
      });
    });

    it('should handle multiple resets', async () => {
      await resetFailedLogins('user1@example.com');
      await resetFailedLogins('user2@example.com');

      expect(prisma.user.update).toHaveBeenCalledTimes(2);
      expect(prisma.user.update).toHaveBeenNthCalledWith(1, {
        where: { email: 'user1@example.com' },
        data: {
          failedLoginAttempts: 0,
          lockedUntil: null,
        },
      });
      expect(prisma.user.update).toHaveBeenNthCalledWith(2, {
        where: { email: 'user2@example.com' },
        data: {
          failedLoginAttempts: 0,
          lockedUntil: null,
        },
      });
    });
  });

  describe('formatLockoutTime', () => {
    it('should format 1 minute correctly (singular)', () => {
      expect(formatLockoutTime(60000)).toBe('1 minute');
    });

    it('should format multiple minutes correctly (plural)', () => {
      expect(formatLockoutTime(120000)).toBe('2 minutes');
    });

    it('should format 15 minutes correctly', () => {
      expect(formatLockoutTime(15 * 60 * 1000)).toBe('15 minutes');
    });

    it('should round up partial minutes', () => {
      expect(formatLockoutTime(90000)).toBe('2 minutes'); // 1.5 minutes -> 2
      expect(formatLockoutTime(61000)).toBe('2 minutes'); // 1.01 minutes -> 2
      expect(formatLockoutTime(59000)).toBe('1 minute'); // 0.98 minutes -> 1
    });

    it('should handle very small values', () => {
      expect(formatLockoutTime(1000)).toBe('1 minute'); // 1 second -> 1 minute
      expect(formatLockoutTime(100)).toBe('1 minute'); // 0.1 second -> 1 minute
    });

    it('should handle large values', () => {
      expect(formatLockoutTime(60 * 60 * 1000)).toBe('60 minutes'); // 1 hour
    });

    it('should handle zero', () => {
      expect(formatLockoutTime(0)).toBe('0 minutes');
    });
  });

  describe('integration scenarios', () => {
    it('should handle complete lockout flow', async () => {
      const email = 'test@example.com';

      // Simulate 5 failed login attempts
      for (let i = 0; i < 5; i++) {
        vi.mocked(prisma.user.findUnique).mockResolvedValue({
          failedLoginAttempts: i,
        } as never);

        const result = await recordFailedLogin(email);

        // First 4 attempts (i=0-3) should not lock, 5th attempt (i=4) should lock
        expect(result.isLocked).toBe(i >= 4);
      }

      expect(prisma.user.update).toHaveBeenCalledTimes(5);
    });

    it('should handle check after lockout', async () => {
      const email = 'locked@example.com';
      const futureDate = new Date(Date.now() + 10 * 60 * 1000);

      vi.mocked(prisma.user.findUnique).mockResolvedValue({
        lockedUntil: futureDate,
        failedLoginAttempts: 5,
      } as never);

      const checkResult = await checkAccountLockout(email);

      expect(checkResult.isLocked).toBe(true);
      expect(checkResult.remainingTime).toBeGreaterThan(0);
    });

    it('should handle successful login after failed attempts', async () => {
      const email = 'recovery@example.com';

      // Record some failed attempts
      vi.mocked(prisma.user.findUnique).mockResolvedValue({
        failedLoginAttempts: 2,
      } as never);
      await recordFailedLogin(email);

      // Successful login - reset
      await resetFailedLogins(email);

      expect(prisma.user.update).toHaveBeenLastCalledWith({
        where: { email },
        data: {
          failedLoginAttempts: 0,
          lockedUntil: null,
        },
      });
    });
  });
});
