/**
 * Database health check utilities
 */

import { prisma } from '@/lib/prisma';

/**
 * Derive a stable API base URL.
 *
 * Rules:
 *  - Development: force http (avoids TLS overhead and self-signed hassles).
 *  - Production (server): prefer AUTH_URL if set; otherwise force https + host derived from env or request context.
 *  - Production (client): always use window.location.origin but ensure protocol is https (rewrite if user loaded over http accidentally).
 *
 * We never return http for production to avoid mixed content warnings.
 */
export function getApiBaseUrl(): string {
  const isDev = process.env.NODE_ENV === 'development';

  // Server-side context
  if (typeof window === 'undefined') {
    if (isDev) {
      return 'http://localhost:3000';
    }
    // Production server: use configured AUTH_URL if provided; otherwise synthesize https://fakefourrecords.com
    const envUrl = process.env.AUTH_URL?.trim();
    if (envUrl) {
      // Normalize any accidental http to https
      return envUrl.startsWith('http://') ? envUrl.replace('http://', 'https://') : envUrl;
    }
    // Fallback: hard-code domain with https to avoid downgrades
    return 'https://fakefourrecords.com';
  }

  // Client-side context
  const { hostname, port, protocol } = window.location;
  const localLike =
    hostname === 'localhost' ||
    hostname === '127.0.0.1' ||
    hostname.endsWith('.local') ||
    hostname.startsWith('192.168.') ||
    hostname.startsWith('10.') ||
    isDev;

  if (localLike) {
    return `http://${hostname}${port ? `:${port}` : ''}`;
  }

  // Enforce https in production client context (in case of proxy / misconfiguration)
  if (protocol === 'http:') {
    return `https://${hostname}${port ? `:${port}` : ''}`;
  }
  return window.location.origin;
}

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
      lastError = error instanceof Error ? error : Error(String(error));

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

  throw lastError || Error('Operation failed after retries');
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
