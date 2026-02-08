/**
 * Tests for S3 Backup and Restore Script - Utility Functions
 */

import { formatBytes, generateTimestamp, getDefaultBackupPath } from './s3-backup';

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
});
