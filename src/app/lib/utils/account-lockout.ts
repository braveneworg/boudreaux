import { prisma } from '@/app/lib/prisma';

const MAX_ATTEMPTS = 5;
const LOCKOUT_DURATION_MS = 15 * 60 * 1000; // 15 minutes

export interface LockoutStatus {
  isLocked: boolean;
  remainingTime?: number;
}

/**
 * Check if an account is currently locked due to failed login attempts
 * @param email User's email address
 * @returns Object indicating if locked and remaining lockout time
 */
export async function checkAccountLockout(email: string): Promise<LockoutStatus> {
  const user = await prisma.user.findUnique({
    where: { email },
    select: { lockedUntil: true, failedLoginAttempts: true },
  });

  if (!user) return { isLocked: false };

  // Check if account is currently locked
  if (user.lockedUntil && user.lockedUntil > new Date()) {
    const remainingTime = user.lockedUntil.getTime() - Date.now();
    return { isLocked: true, remainingTime };
  }

  // If lockout expired, reset the counter
  if (user.lockedUntil && user.lockedUntil <= new Date() && user.failedLoginAttempts > 0) {
    await prisma.user.update({
      where: { email },
      data: {
        failedLoginAttempts: 0,
        lockedUntil: null,
      },
    });
  }

  return { isLocked: false };
}

/**
 * Record a failed login attempt and lock account if threshold reached
 * @param email User's email address
 * @returns Updated lockout status
 */
export async function recordFailedLogin(email: string): Promise<LockoutStatus> {
  const user = await prisma.user.findUnique({
    where: { email },
    select: { failedLoginAttempts: true },
  });

  if (!user) return { isLocked: false };

  const newAttempts = (user.failedLoginAttempts || 0) + 1;
  const shouldLock = newAttempts >= MAX_ATTEMPTS;

  await prisma.user.update({
    where: { email },
    data: {
      failedLoginAttempts: newAttempts,
      lockedUntil: shouldLock ? new Date(Date.now() + LOCKOUT_DURATION_MS) : null,
    },
  });

  return {
    isLocked: shouldLock,
    remainingTime: shouldLock ? LOCKOUT_DURATION_MS : undefined,
  };
}

/**
 * Reset failed login attempts for a user (e.g., after successful login)
 * @param email User's email address
 */
export async function resetFailedLogins(email: string): Promise<void> {
  await prisma.user.update({
    where: { email },
    data: {
      failedLoginAttempts: 0,
      lockedUntil: null,
    },
  });
}

/**
 * Format remaining lockout time in a human-readable format
 * @param ms Milliseconds remaining
 * @returns Formatted string (e.g., "14 minutes")
 */
export function formatLockoutTime(ms: number): string {
  const minutes = Math.ceil(ms / 60000);
  return `${minutes} minute${minutes !== 1 ? 's' : ''}`;
}
