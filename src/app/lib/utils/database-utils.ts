/**
 * Database health check utilities
 */

import { prisma } from '../prisma';

interface HealthCheckResult {
  healthy: boolean;
  latency?: number;
  error?: string;
}

/**
 * Check database connection health
 */
export async function checkDatabaseHealth(): Promise<HealthCheckResult> {
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
}

/**
 * Retry database operation with exponential backoff
 */
export async function withRetry<T>(
  operation: () => Promise<T>,
  options: {
    maxRetries?: number;
    initialDelay?: number;
    maxDelay?: number;
    factor?: number;
  } = {}
): Promise<T> {
  const { maxRetries = 3, initialDelay = 1000, maxDelay = 10000, factor = 2 } = options;

  let lastError: Error | undefined;
  let delay = initialDelay;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      // Don't retry on last attempt
      if (attempt === maxRetries) {
        break;
      }

      // Check if error is retryable
      if (!isRetryableError(lastError)) {
        throw lastError;
      }

      // Wait before retrying with exponential backoff
      await new Promise((resolve) => setTimeout(resolve, delay));
      delay = Math.min(delay * factor, maxDelay);
    }
  }

  throw lastError || new Error('Operation failed after retries');
}

/**
 * Determine if an error is retryable
 */
function isRetryableError(error: Error): boolean {
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
}
