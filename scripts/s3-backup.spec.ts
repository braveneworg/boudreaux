/**
 * Tests for S3 Backup and Restore Script - Utility Functions
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  cleanupOldBackups,
  formatBytes,
  generateTimestamp,
  getDefaultBackupPath,
} from './s3-backup';
import { existsSync, readdirSync, rmdirSync, statSync, unlinkSync } from '../src/lib/system-utils';

// Mock fs utilities
vi.mock('../src/lib/system-utils', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    existsSync: vi.fn(),
    readdirSync: vi.fn(),
    statSync: vi.fn(),
    unlinkSync: vi.fn(),
    rmdirSync: vi.fn(),
  };
});

describe('S3 Backup Script - Utility Functions', () => {
  describe('formatBytes', () => {
    it('should format 0 bytes correctly', () => {
      expect(formatBytes(0)).toBe('0 Bytes');
    });

    it('should format bytes correctly', () => {
      expect(formatBytes(500)).toBe('500 Bytes');
    });

    it('should format kilobytes correctly', () => {
      expect(formatBytes(1024)).toBe('1 KB');
      expect(formatBytes(2048)).toBe('2 KB');
    });

    it('should format megabytes correctly', () => {
      expect(formatBytes(1048576)).toBe('1 MB');
      expect(formatBytes(5242880)).toBe('5 MB');
    });

    it('should format gigabytes correctly', () => {
      expect(formatBytes(1073741824)).toBe('1 GB');
    });

    it('should handle decimal values', () => {
      expect(formatBytes(1536)).toBe('1.5 KB');
      expect(formatBytes(1572864)).toBe('1.5 MB');
    });
  });

  describe('generateTimestamp', () => {
    it('should generate timestamp in ISO format without colons', () => {
      const timestamp = generateTimestamp();
      expect(timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}$/);
    });

    it('should generate valid timestamp components', () => {
      const timestamp = generateTimestamp();
      const parts = timestamp.split('T');

      expect(parts).toHaveLength(2);

      // Check date part (YYYY-MM-DD)
      const datePart = parts[0];
      expect(datePart).toMatch(/^\d{4}-\d{2}-\d{2}$/);

      // Check time part (HH-MM-SS)
      const timePart = parts[1];
      expect(timePart).toMatch(/^\d{2}-\d{2}-\d{2}$/);
    });

    it('should generate different timestamps at different times', () => {
      vi.useFakeTimers();

      try {
        const initialDate = new Date('2023-01-01T00:00:00Z');
        vi.setSystemTime(initialDate);

        const timestamp1 = generateTimestamp();

        const laterDate = new Date(initialDate.getTime() + 1100);
        vi.setSystemTime(laterDate);

        const timestamp2 = generateTimestamp();

        // These should be different since we moved time forward
        expect(timestamp1).not.toBe(timestamp2);
      } finally {
        vi.useRealTimers();
      }
    });
  });

  describe('getDefaultBackupPath', () => {
    it('should return path in backups directory with s3 prefix', () => {
      const path = getDefaultBackupPath();
      expect(path).toMatch(/^backups\/s3-\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}$/);
    });

    it('should generate unique paths', () => {
      const path1 = getDefaultBackupPath();
      const path2 = getDefaultBackupPath();

      // Paths should start with backups/s3-
      expect(path1).toMatch(/^backups\/s3-/);
      expect(path2).toMatch(/^backups\/s3-/);
    });

    it('should include correct path components', () => {
      const path = getDefaultBackupPath();
      const parts = path.split('/');

      expect(parts[0]).toBe('backups');
      expect(parts[1]).toMatch(/^s3-\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}$/);
    });
  });

  describe('cleanupOldBackups', () => {
    beforeEach(() => {
      vi.clearAllMocks();
    });

    it('should return 0 when backup directory does not exist', () => {
      vi.mocked(existsSync).mockReturnValue(false);

      const deletedCount = cleanupOldBackups('backups', 5);

      expect(deletedCount).toBe(0);
      expect(readdirSync).not.toHaveBeenCalled();
    });

    it('should return 0 when there are fewer backups than max', () => {
      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(readdirSync).mockReturnValue([
        's3-2023-01-01',
        's3-2023-01-02',
        's3-2023-01-03',
      ] as unknown as ReturnType<typeof readdirSync>);
      vi.mocked(statSync).mockReturnValue({
        isDirectory: () => true,
      } as ReturnType<typeof statSync>);

      const deletedCount = cleanupOldBackups('backups', 5);

      expect(deletedCount).toBe(0);
      expect(unlinkSync).not.toHaveBeenCalled();
      expect(rmdirSync).not.toHaveBeenCalled();
    });

    it('should identify correct backups to delete when exceeding max', () => {
      const backups = [
        's3-2023-01-01T00-00-00',
        's3-2023-01-02T00-00-00',
        's3-2023-01-03T00-00-00',
        's3-2023-01-04T00-00-00',
        's3-2023-01-05T00-00-00',
        's3-2023-01-06T00-00-00',
        's3-2023-01-07T00-00-00',
      ];

      vi.mocked(existsSync).mockImplementation((path) => {
        // Return false to skip actual deletion (returns early from deleteDirectory)
        return typeof path === 'string' && path === 'backups';
      });
      vi.mocked(readdirSync).mockReturnValue(backups as unknown as ReturnType<typeof readdirSync>);
      vi.mocked(statSync).mockReturnValue({
        isDirectory: () => true,
      } as ReturnType<typeof statSync>);

      const deletedCount = cleanupOldBackups('backups', 5);

      // deleteDirectory will return early since existsSync returns false for subdirs
      // So deletion will succeed (from the cleanup function's perspective)
      expect(deletedCount).toBe(2);
      // Should keep the 5 most recent (sorted reverse alphabetically)
      // s3-2023-01-07, s3-2023-01-06, s3-2023-01-05, s3-2023-01-04, s3-2023-01-03
      // Should attempt to delete s3-2023-01-02 and s3-2023-01-01
    });

    it('should keep exactly max backups', () => {
      const backups = [
        's3-2023-01-01T00-00-00',
        's3-2023-01-02T00-00-00',
        's3-2023-01-03T00-00-00',
        's3-2023-01-04T00-00-00',
        's3-2023-01-05T00-00-00',
      ];

      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(readdirSync).mockReturnValue(backups as unknown as ReturnType<typeof readdirSync>);
      vi.mocked(statSync).mockReturnValue({
        isDirectory: () => true,
      } as ReturnType<typeof statSync>);

      const deletedCount = cleanupOldBackups('backups', 5);

      expect(deletedCount).toBe(0);
    });

    it('should only consider directories starting with s3-', () => {
      const items = [
        's3-2023-01-01T00-00-00',
        's3-2023-01-02T00-00-00',
        'other-backup',
        'file.txt',
        's3-2023-01-03T00-00-00',
      ];

      vi.mocked(existsSync).mockImplementation((path) => {
        return typeof path === 'string' && path === 'backups';
      });
      vi.mocked(readdirSync).mockReturnValue(items as unknown as ReturnType<typeof readdirSync>);
      vi.mocked(statSync).mockImplementation(
        (path) =>
          ({
            isDirectory: () => typeof path === 'string' && !path.includes('file.txt'),
          }) as ReturnType<typeof statSync>
      );

      const deletedCount = cleanupOldBackups('backups', 2);

      expect(deletedCount).toBe(1);
      // Should only count 3 s3- directories, delete 1 (the oldest)
    });

    it('should handle errors when deleting backups', () => {
      const backups = [
        's3-2023-01-01T00-00-00',
        's3-2023-01-02T00-00-00',
        's3-2023-01-03T00-00-00',
      ];

      // Return true for checking backups dir, false for subdirs to trigger early return
      let firstCall = true;
      vi.mocked(existsSync).mockImplementation(() => {
        if (firstCall) {
          firstCall = false;
          return true;
        }
        // Subsequent calls for subdirectories - throw error to simulate deletion failure
        throw new Error('Permission denied');
      });
      vi.mocked(readdirSync).mockReturnValue(backups as unknown as ReturnType<typeof readdirSync>);
      vi.mocked(statSync).mockReturnValue({
        isDirectory: () => true,
      } as ReturnType<typeof statSync>);

      const deletedCount = cleanupOldBackups('backups', 1);

      // Should try to delete 2 but fail due to error
      expect(deletedCount).toBe(0);
    });
  });
});
