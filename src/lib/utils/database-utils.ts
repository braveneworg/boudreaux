/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
/**
 * Database health check utilities
 */

import { prisma } from '@/lib/prisma';

interface HealthCheckResult {
  healthy: boolean;
  latency?: number;
  error?: string;
}

/**
 * Check database connection health
 */
export const checkDatabaseHealth = async (): Promise<HealthCheckResult> => {
  const start = Date.now();

  try {
    // For MongoDB, we use $runCommandRaw to check connection
    // This is the MongoDB-compatible way to verify the database is accessible
    await prisma.$runCommandRaw({ ping: 1 });

    const latency = Date.now() - start;

    return {
      healthy: true,
      latency,
    };
  } catch (error) {
    return {
      healthy: false,
      error: error instanceof Error ? error.message : 'Unknown database error',
    };
  }
};

/**
 * Retry database operation with exponential backoff
 */
const toError = (error: unknown): Error => (error instanceof Error ? error : Error(String(error)));

const delayFor = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/** Outcome of a single attempt — a value on success, or the normalized error. */
type AttemptResult<T> = { ok: true; value: T } | { ok: false; error: Error };

const runAttempt = async <T>(operation: () => Promise<T>): Promise<AttemptResult<T>> => {
  try {
    return { ok: true, value: await operation() };
  } catch (error) {
    return { ok: false, error: toError(error) };
  }
};

interface RetryOptions {
  maxRetries?: number;
  initialDelay?: number;
  maxDelay?: number;
  factor?: number;
}

interface ResolvedRetryOptions {
  maxRetries: number;
  initialDelay: number;
  maxDelay: number;
  factor: number;
}

const resolveRetryOptions = (options: RetryOptions): ResolvedRetryOptions => ({
  maxRetries: options.maxRetries ?? 3,
  initialDelay: options.initialDelay ?? 1000,
  maxDelay: options.maxDelay ?? 10000,
  factor: options.factor ?? 2,
});

export const withRetry = async <T>(
  operation: () => Promise<T>,
  options: RetryOptions = {}
): Promise<T> => {
  const { maxRetries, initialDelay, maxDelay, factor } = resolveRetryOptions(options);

  let lastError: Error | undefined;
  let delay = initialDelay;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const result = await runAttempt(operation);
    if (result.ok) {
      return result.value;
    }
    lastError = result.error;

    // Don't retry on last attempt
    if (attempt === maxRetries) {
      break;
    }

    // Check if error is retryable
    if (!isRetryableError(lastError)) {
      throw lastError;
    }

    // Wait before retrying with exponential backoff
    await delayFor(delay);
    delay = Math.min(delay * factor, maxDelay);
  }

  throw lastError || Error('Operation failed after retries');
};

/**
 * Determine if an error is retryable
 */
const isRetryableError = (error: Error): boolean => {
  const retryableMessages = [
    'ETIMEOUT',
    'ECONNRESET',
    'ENOTFOUND',
    'timeout',
    'timed out',
    'connection',
  ];

  const message = error.message.toLowerCase();
  return retryableMessages.some((msg) => message.includes(msg.toLowerCase()));
};
