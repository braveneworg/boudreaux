import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { checkDatabaseHealth, withRetry } from './database-utils';
import { prisma } from '../prisma';

// Mock the prisma client
vi.mock('../prisma', () => ({
  prisma: {
    $queryRaw: vi.fn(),
  },
}));

// Create a typed mock
const mockedPrisma = prisma as unknown as {
  $queryRaw: ReturnType<typeof vi.fn>;
};

describe('Database Utils', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('checkDatabaseHealth', () => {
    it('should return healthy status when database connection succeeds', async () => {
      mockedPrisma.$queryRaw.mockResolvedValue([{ '?column?': 1 }]);

      const result = await checkDatabaseHealth();

      expect(result.healthy).toBe(true);
      expect(result.latency).toBeDefined();
      expect(typeof result.latency).toBe('number');
      expect(result.latency).toBeGreaterThanOrEqual(0);
      expect(result.error).toBeUndefined();
    });

    it('should measure latency correctly', async () => {
      mockedPrisma.$queryRaw.mockImplementation(
        () =>
          new Promise((resolve) => {
            setTimeout(() => resolve([{ '?column?': 1 }]), 100);
          })
      );

      const result = await checkDatabaseHealth();

      expect(result.healthy).toBe(true);
      expect(result.latency).toBeGreaterThanOrEqual(100);
    });

    it('should return unhealthy status when database connection fails', async () => {
      const errorMessage = 'Connection timeout';
      mockedPrisma.$queryRaw.mockRejectedValue(new Error(errorMessage));

      const result = await checkDatabaseHealth();

      expect(result.healthy).toBe(false);
      expect(result.error).toBe(errorMessage);
      expect(result.latency).toBeUndefined();
    });

    it('should handle non-Error objects in catch block', async () => {
      mockedPrisma.$queryRaw.mockRejectedValue('String error');

      const result = await checkDatabaseHealth();

      expect(result.healthy).toBe(false);
      expect(result.error).toBe('Unknown database error');
    });

    it('should execute raw SQL query', async () => {
      mockedPrisma.$queryRaw.mockResolvedValue([{ '?column?': 1 }]);

      await checkDatabaseHealth();

      expect(mockedPrisma.$queryRaw).toHaveBeenCalledTimes(1);
    });
  });

  describe('withRetry', () => {
    it('should succeed on first attempt', async () => {
      const operation = vi.fn().mockResolvedValue('success');

      const result = await withRetry(operation);

      expect(result).toBe('success');
      expect(operation).toHaveBeenCalledTimes(1);
    });

    it('should retry on retryable errors', async () => {
      const operation = vi
        .fn()
        .mockRejectedValueOnce(new Error('ETIMEOUT'))
        .mockResolvedValue('success');

      const result = await withRetry(operation, {
        maxRetries: 3,
        initialDelay: 10,
      });

      expect(result).toBe('success');
      expect(operation).toHaveBeenCalledTimes(2);
    });

    it('should retry up to maxRetries times', async () => {
      const operation = vi.fn().mockRejectedValue(new Error('timeout'));

      await expect(withRetry(operation, { maxRetries: 3, initialDelay: 10 })).rejects.toThrow(
        'timeout'
      );

      expect(operation).toHaveBeenCalledTimes(4); // Initial + 3 retries
    });

    it('should use exponential backoff', async () => {
      const operation = vi.fn().mockRejectedValue(new Error('ECONNRESET'));
      const delays: number[] = [];
      const originalSetTimeout = global.setTimeout;

      // Mock setTimeout to track delays
      vi.spyOn(global, 'setTimeout').mockImplementation(((callback: () => void, delay: number) => {
        delays.push(delay);
        return originalSetTimeout(callback, 0);
      }) as typeof setTimeout);

      await expect(
        withRetry(operation, {
          maxRetries: 3,
          initialDelay: 100,
          factor: 2,
        })
      ).rejects.toThrow();

      // Check exponential backoff: 100, 200, 400
      expect(delays).toEqual([100, 200, 400]);
    });

    it('should respect maxDelay', async () => {
      const operation = vi.fn().mockRejectedValue(new Error('timeout'));
      const delays: number[] = [];
      const originalSetTimeout = global.setTimeout;

      vi.spyOn(global, 'setTimeout').mockImplementation(((callback: () => void, delay: number) => {
        delays.push(delay);
        return originalSetTimeout(callback, 0);
      }) as typeof setTimeout);

      await expect(
        withRetry(operation, {
          maxRetries: 4,
          initialDelay: 100,
          factor: 3,
          maxDelay: 250,
        })
      ).rejects.toThrow();

      // Check delays cap at maxDelay: 100, 250, 250, 250
      expect(delays).toEqual([100, 250, 250, 250]);
    });

    it('should not retry non-retryable errors', async () => {
      const operation = vi.fn().mockRejectedValue(new Error('Invalid data'));

      await expect(withRetry(operation, { maxRetries: 3, initialDelay: 10 })).rejects.toThrow(
        'Invalid data'
      );

      expect(operation).toHaveBeenCalledTimes(1);
    });

    it('should identify retryable error types', async () => {
      const retryableErrors = [
        'ETIMEOUT',
        'ECONNRESET',
        'ENOTFOUND',
        'timeout error',
        'operation timed out',
        'connection refused',
      ];

      for (const errorMsg of retryableErrors) {
        const operation = vi
          .fn()
          .mockRejectedValueOnce(new Error(errorMsg))
          .mockResolvedValue('success');

        const result = await withRetry(operation, { maxRetries: 2, initialDelay: 10 });

        expect(result).toBe('success');
        expect(operation).toHaveBeenCalledTimes(2);

        vi.clearAllMocks();
      }
    });

    it('should handle operations that return different types', async () => {
      const objectOperation = vi.fn().mockResolvedValue({ data: 'test' });
      const numberOperation = vi.fn().mockResolvedValue(42);
      const arrayOperation = vi.fn().mockResolvedValue([1, 2, 3]);

      const objectResult = await withRetry(objectOperation);
      const numberResult = await withRetry(numberOperation);
      const arrayResult = await withRetry(arrayOperation);

      expect(objectResult).toEqual({ data: 'test' });
      expect(numberResult).toBe(42);
      expect(arrayResult).toEqual([1, 2, 3]);
    });

    it('should use default options when not provided', async () => {
      const operation = vi
        .fn()
        .mockRejectedValueOnce(new Error('timeout'))
        .mockResolvedValue('success');

      const result = await withRetry(operation);

      expect(result).toBe('success');
    });

    it('should handle case-insensitive error messages', async () => {
      const operation = vi
        .fn()
        .mockRejectedValueOnce(new Error('TIMEOUT ERROR'))
        .mockRejectedValueOnce(new Error('Connection Failed'))
        .mockResolvedValue('success');

      const result = await withRetry(operation, {
        maxRetries: 3,
        initialDelay: 10,
      });

      expect(result).toBe('success');
      expect(operation).toHaveBeenCalledTimes(3);
    });

    it('should throw last error when all retries exhausted', async () => {
      const lastError = new Error('Final timeout error');
      const operation = vi
        .fn()
        .mockRejectedValueOnce(new Error('First timeout'))
        .mockRejectedValueOnce(new Error('Second timeout'))
        .mockRejectedValue(lastError);

      await expect(withRetry(operation, { maxRetries: 2, initialDelay: 10 })).rejects.toThrow(
        'Final timeout error'
      );
    });

    it('should handle non-Error thrown values', async () => {
      const operation = vi.fn().mockRejectedValue('string error with timeout');

      await expect(withRetry(operation, { maxRetries: 2, initialDelay: 10 })).rejects.toThrow(
        'string error with timeout'
      );
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });
});
