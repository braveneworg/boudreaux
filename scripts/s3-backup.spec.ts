/**
 * Tests for S3 Backup and Restore Script
 */
import {
  backupS3ToLocal,
  cleanupOldBackups,
  formatBytes,
  generateTimestamp,
  getBackupRootDir,
  getDefaultBackupPath,
  invalidateCloudFrontCache,
  listBackups,
  restoreLocalToS3,
} from './s3-backup';

// Hoisted mock functions - vitest moves these above imports during transformation
const {
  s3ClientSendMock,
  cloudFrontSendMock,
  existsSyncMock,
  mkdirSyncMock,
  readdirSyncMock,
  statSyncMock,
  writeFileSyncMock,
  readFileSyncMock,
  unlinkSyncMock,
  rmdirSyncMock,
  createWriteStreamMock,
  createReadStreamMock,
  pipelineMock,
  sanitizeFilePathMock,
  mimeGetTypeMock,
  putObjectCommandMock,
  createInvalidationCommandMock,
} = vi.hoisted(() => ({
  s3ClientSendMock: vi.fn(),
  cloudFrontSendMock: vi.fn(),
  existsSyncMock: vi.fn(),
  mkdirSyncMock: vi.fn(),
  readdirSyncMock: vi.fn(),
  statSyncMock: vi.fn(),
  writeFileSyncMock: vi.fn(),
  readFileSyncMock: vi.fn(),
  unlinkSyncMock: vi.fn(),
  rmdirSyncMock: vi.fn(),
  createWriteStreamMock: vi.fn(() => ({
    on: vi.fn(),
    once: vi.fn(),
    emit: vi.fn(),
  })),
  createReadStreamMock: vi.fn(() => ({})),
  pipelineMock: vi.fn().mockResolvedValue(undefined),
  sanitizeFilePathMock: vi.fn((pathKey: string) => pathKey),
  mimeGetTypeMock: vi.fn().mockReturnValue('application/octet-stream'),
  putObjectCommandMock: vi.fn(),
  createInvalidationCommandMock: vi.fn(),
}));

// Module mocks - vitest hoists these above imports
vi.mock('@aws-sdk/client-s3', () => ({
  S3Client: class MockS3Client {
    send = s3ClientSendMock;
  },
  ListObjectsV2Command: vi.fn(),
  GetObjectCommand: vi.fn(),
  PutObjectCommand: putObjectCommandMock,
  HeadObjectCommand: vi.fn(),
}));

vi.mock('@aws-sdk/client-cloudfront', () => ({
  CloudFrontClient: class MockCloudFrontClient {
    send = cloudFrontSendMock;
  },
  CreateInvalidationCommand: createInvalidationCommandMock,
}));

vi.mock('../src/lib/system-utils', () => ({
  existsSync: existsSyncMock,
  mkdirSync: mkdirSyncMock,
  readdirSync: readdirSyncMock,
  statSync: statSyncMock,
  writeFileSync: writeFileSyncMock,
  readFileSync: readFileSyncMock,
  unlinkSync: unlinkSyncMock,
  rmdirSync: rmdirSyncMock,
}));

vi.mock('../src/lib/utils/sanitization', () => ({
  sanitizeFilePath: sanitizeFilePathMock,
}));

vi.mock('fs', async () => {
  const actual = await vi.importActual('fs');
  const actualModule = actual as Record<string, unknown>;
  return {
    ...actualModule,
    default: {
      ...actualModule,
      createWriteStream: createWriteStreamMock,
      createReadStream: createReadStreamMock,
    },
    createWriteStream: createWriteStreamMock,
    createReadStream: createReadStreamMock,
  };
});

vi.mock('stream/promises', () => ({
  default: { pipeline: pipelineMock },
  pipeline: pipelineMock,
}));

vi.mock('mime', () => ({
  default: {
    getType: mimeGetTypeMock,
  },
}));

vi.mock('dotenv', () => ({
  default: {
    config: vi.fn(),
  },
}));

describe('S3 Backup Script', () => {
  const mockConsoleInfo = vi.spyOn(console, 'info').mockImplementation(() => {});
  const mockConsoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
  const mockConsoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => {});

  beforeEach(() => {
    vi.clearAllMocks();

    // Restore default implementations after clearAllMocks
    sanitizeFilePathMock.mockImplementation((pathKey: string) => pathKey);
    pipelineMock.mockResolvedValue(undefined);
    mimeGetTypeMock.mockReturnValue('application/octet-stream');
    createWriteStreamMock.mockReturnValue({
      on: vi.fn(),
      once: vi.fn(),
      emit: vi.fn(),
    });
    createReadStreamMock.mockReturnValue({});
  });

  describe('Utility Functions', () => {
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

      it('should format terabytes correctly', () => {
        expect(formatBytes(1099511627776)).toBe('1 TB');
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
        expect(parts[0]).toMatch(/^\d{4}-\d{2}-\d{2}$/);
        expect(parts[1]).toMatch(/^\d{2}-\d{2}-\d{2}$/);
      });

      it('should generate different timestamps at different times', () => {
        vi.useFakeTimers();

        try {
          vi.setSystemTime(new Date('2023-01-01T00:00:00Z'));
          const timestamp1 = generateTimestamp();

          vi.setSystemTime(new Date('2023-01-01T00:00:01Z'));
          const timestamp2 = generateTimestamp();

          expect(timestamp1).not.toBe(timestamp2);
        } finally {
          vi.useRealTimers();
        }
      });
    });

    describe('getDefaultBackupPath', () => {
      it('should return path in backups directory with s3 prefix', () => {
        const path = getDefaultBackupPath();
        expect(path).toMatch(/^backups[\\/]s3-\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}$/);
      });

      it('should generate unique paths', () => {
        const path1 = getDefaultBackupPath();
        const path2 = getDefaultBackupPath();

        expect(path1).toMatch(/^backups[\\/]s3-/);
        expect(path2).toMatch(/^backups[\\/]s3-/);
      });

      it('should include correct path components', () => {
        const path = getDefaultBackupPath();
        const match = path.match(/^backups[\\/](s3-\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2})$/);

        expect(match).not.toBeNull();
        expect(match?.[1]).toMatch(/^s3-\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}$/);
      });
    });
  });

  describe('getBackupRootDir', () => {
    it('should return parent directory for timestamped backup directory', () => {
      expect(getBackupRootDir('backups/s3-2026-01-15T00-00-00')).toBe('backups');
      expect(getBackupRootDir('/home/user/backups/s3-2026-02-08T10-30-45')).toBe(
        '/home/user/backups'
      );
    });

    it('should return the same directory for non-timestamped directories', () => {
      expect(getBackupRootDir('backups')).toBe('backups');
      expect(getBackupRootDir('./my-backup')).toBe('./my-backup');
      expect(getBackupRootDir('/home/user/backups')).toBe('/home/user/backups');
    });

    it('should handle edge cases', () => {
      expect(getBackupRootDir('s3-2026-01-15')).toBe('.');
      expect(getBackupRootDir('my-s3-backup')).toBe('my-s3-backup');
      expect(getBackupRootDir('data/s3-files/backup')).toBe('data/s3-files/backup');
    });
  });

  describe('backupS3ToLocal', () => {
    const testBucket = 'test-bucket';
    const testRegion = 'us-east-1';
    const localDir = '/test/backup';

    beforeEach(() => {
      existsSyncMock.mockReturnValue(true);
      mkdirSyncMock.mockReturnValue(undefined);
      writeFileSyncMock.mockReturnValue(undefined);
      // Default: no previous backups (for change detection in getLatestBackupMetadata)
      readdirSyncMock.mockReturnValue([]);
      s3ClientSendMock.mockReset();
    });

    it('should create backup directory if it does not exist', async () => {
      existsSyncMock.mockReturnValue(false);
      s3ClientSendMock
        .mockResolvedValueOnce({
          Contents: [{ Key: 'photo.jpg', Size: 100, LastModified: new Date() }],
          NextContinuationToken: undefined,
        })
        .mockResolvedValueOnce({
          Body: { pipe: vi.fn() },
          ContentType: 'image/jpeg',
        });

      await backupS3ToLocal(localDir, testBucket, '', testRegion);

      expect(mkdirSyncMock).toHaveBeenCalledWith(localDir, { recursive: true });
    });

    it('should backup single S3 object successfully', async () => {
      const mockObject = {
        Key: 'photo.jpg',
        Size: 1024,
        LastModified: new Date('2026-01-01T00:00:00Z'),
      };

      s3ClientSendMock
        .mockResolvedValueOnce({
          Contents: [mockObject],
          NextContinuationToken: undefined,
        })
        .mockResolvedValueOnce({
          Body: { pipe: vi.fn() },
          ContentType: 'image/jpeg',
        });

      const result = await backupS3ToLocal(localDir, testBucket, '', testRegion);

      expect(result.totalFiles).toBe(1);
      expect(result.totalSize).toBe(1024);
      expect(result.files).toHaveLength(1);
      expect(result.files[0].key).toBe('photo.jpg');
      expect(result.files[0].contentType).toBe('image/jpeg');
    });

    it('should backup multiple S3 objects successfully', async () => {
      const mockObjects = [
        { Key: 'file1.png', Size: 1024, LastModified: new Date() },
        { Key: 'file2.jpg', Size: 2048, LastModified: new Date() },
        { Key: 'file3.mp3', Size: 4096, LastModified: new Date() },
      ];

      // New: listing happens first, then all downloads
      s3ClientSendMock
        .mockResolvedValueOnce({
          Contents: mockObjects,
          NextContinuationToken: undefined,
        })
        .mockResolvedValueOnce({ Body: { pipe: vi.fn() }, ContentType: 'image/png' })
        .mockResolvedValueOnce({ Body: { pipe: vi.fn() }, ContentType: 'image/jpeg' })
        .mockResolvedValueOnce({ Body: { pipe: vi.fn() }, ContentType: 'audio/mpeg' });

      const result = await backupS3ToLocal(localDir, testBucket, '', testRegion);

      expect(result.totalFiles).toBe(3);
      expect(result.totalSize).toBe(7168);
      expect(result.files).toHaveLength(3);
    });

    it('should handle pagination with continuation tokens', async () => {
      // New: all listing happens first, then all downloads
      s3ClientSendMock
        .mockResolvedValueOnce({
          Contents: [{ Key: 'page1-file.jpg', Size: 100, LastModified: new Date() }],
          NextContinuationToken: 'token-page2',
        })
        .mockResolvedValueOnce({
          Contents: [{ Key: 'page2-file.png', Size: 200, LastModified: new Date() }],
          NextContinuationToken: undefined,
        })
        .mockResolvedValueOnce({ Body: { pipe: vi.fn() }, ContentType: 'image/jpeg' })
        .mockResolvedValueOnce({ Body: { pipe: vi.fn() }, ContentType: 'image/png' });

      const result = await backupS3ToLocal(localDir, testBucket, '', testRegion);

      expect(result.totalFiles).toBe(2);
      expect(result.totalSize).toBe(300);
      expect(result.files[0].key).toBe('page1-file.jpg');
      expect(result.files[1].key).toBe('page2-file.png');
    });

    it('should handle empty bucket', async () => {
      s3ClientSendMock.mockResolvedValue({ Contents: [] });

      const result = await backupS3ToLocal(localDir, testBucket, '', testRegion);

      expect(result.totalFiles).toBe(0);
      expect(result.totalSize).toBe(0);
      expect(mockConsoleWarn).toHaveBeenCalledWith(
        expect.stringContaining('No eligible media files found')
      );
    });

    it('should handle undefined Contents in S3 response', async () => {
      s3ClientSendMock.mockResolvedValue({ Contents: undefined });

      const result = await backupS3ToLocal(localDir, testBucket, '', testRegion);

      expect(result.totalFiles).toBe(0);
      expect(mockConsoleWarn).toHaveBeenCalledWith(
        expect.stringContaining('No eligible media files found')
      );
    });

    it('should handle objects with no key', async () => {
      s3ClientSendMock.mockResolvedValue({
        Contents: [{ Key: undefined, Size: 1024, LastModified: new Date() }],
        NextContinuationToken: undefined,
      });

      const result = await backupS3ToLocal(localDir, testBucket, '', testRegion);

      expect(result.totalFiles).toBe(0);
    });

    it('should skip non-media files', async () => {
      s3ClientSendMock
        .mockResolvedValueOnce({
          Contents: [
            { Key: 'script.js', Size: 100, LastModified: new Date() },
            { Key: 'style.css', Size: 200, LastModified: new Date() },
            { Key: 'page.html', Size: 300, LastModified: new Date() },
            { Key: 'photo.jpg', Size: 400, LastModified: new Date() },
          ],
          NextContinuationToken: undefined,
        })
        .mockResolvedValueOnce({ Body: { pipe: vi.fn() }, ContentType: 'image/jpeg' });

      const result = await backupS3ToLocal(localDir, testBucket, '', testRegion);

      expect(result.totalFiles).toBe(1);
      expect(result.files[0].key).toBe('photo.jpg');
    });

    it('should skip objects with invalid keys detected by path sanitization', async () => {
      sanitizeFilePathMock.mockImplementation((pathKey: string) => {
        if (pathKey.includes('..')) throw new Error('Path traversal detected');
        return pathKey;
      });

      s3ClientSendMock
        .mockResolvedValueOnce({
          Contents: [
            { Key: '../../../etc/passwd.jpg', Size: 100, LastModified: new Date() },
            { Key: 'valid-file.jpg', Size: 200, LastModified: new Date() },
          ],
          NextContinuationToken: undefined,
        })
        .mockResolvedValueOnce({ Body: { pipe: vi.fn() }, ContentType: 'image/jpeg' });

      const result = await backupS3ToLocal(localDir, testBucket, '', testRegion);

      expect(result.totalFiles).toBe(1);
      expect(result.files[0].key).toBe('valid-file.jpg');
      expect(mockConsoleWarn).toHaveBeenCalledWith(
        expect.stringContaining('Skipping object with invalid key')
      );
    });

    it('should handle objects with no body', async () => {
      s3ClientSendMock
        .mockResolvedValueOnce({
          Contents: [{ Key: 'test.jpg', Size: 1024, LastModified: new Date() }],
          NextContinuationToken: undefined,
        })
        .mockResolvedValueOnce({
          Body: undefined,
          ContentType: 'image/jpeg',
        });

      const result = await backupS3ToLocal(localDir, testBucket, '', testRegion);

      expect(result.totalFiles).toBe(0);
      expect(mockConsoleWarn).toHaveBeenCalledWith(expect.stringContaining('No body for test.jpg'));
    });

    it('should handle individual object download failures', async () => {
      // New: listing happens first, then downloads
      s3ClientSendMock
        .mockResolvedValueOnce({
          Contents: [
            { Key: 'fail.jpg', Size: 1024, LastModified: new Date() },
            { Key: 'success.png', Size: 2048, LastModified: new Date() },
          ],
          NextContinuationToken: undefined,
        })
        .mockRejectedValueOnce(new Error('Download failed'))
        .mockResolvedValueOnce({
          Body: { pipe: vi.fn() },
          ContentType: 'image/png',
        });

      const result = await backupS3ToLocal(localDir, testBucket, '', testRegion);

      expect(result.totalFiles).toBe(1);
      expect(result.files[0].key).toBe('success.png');
      expect(mockConsoleError).toHaveBeenCalledWith(
        expect.stringContaining('Error downloading fail.jpg')
      );
    });

    it('should save metadata file after backup', async () => {
      s3ClientSendMock
        .mockResolvedValueOnce({
          Contents: [{ Key: 'test.jpg', Size: 1024, LastModified: new Date() }],
          NextContinuationToken: undefined,
        })
        .mockResolvedValueOnce({
          Body: { pipe: vi.fn() },
          ContentType: 'image/jpeg',
        });

      await backupS3ToLocal(localDir, testBucket, '', testRegion);

      expect(writeFileSyncMock).toHaveBeenCalledWith(
        expect.stringContaining('backup-metadata.json'),
        expect.any(String)
      );
    });

    it('should create nested directory structure for objects', async () => {
      s3ClientSendMock
        .mockResolvedValueOnce({
          Contents: [{ Key: 'path/to/file.jpg', Size: 1024, LastModified: new Date() }],
          NextContinuationToken: undefined,
        })
        .mockResolvedValueOnce({
          Body: { pipe: vi.fn() },
          ContentType: 'image/jpeg',
        });

      // existsSync returns false for nested dirs to trigger mkdir
      existsSyncMock.mockImplementation((checkPath: string) => {
        if (typeof checkPath === 'string' && checkPath.includes('path/to')) return false;
        return true;
      });

      await backupS3ToLocal(localDir, testBucket, '', testRegion);

      // Should create the nested directory structure
      expect(mkdirSyncMock).toHaveBeenCalledWith(expect.stringContaining('path'), {
        recursive: true,
      });
    });

    it('should throw error on S3 list failure', async () => {
      s3ClientSendMock.mockRejectedValue(new Error('S3 error'));

      await expect(backupS3ToLocal(localDir, testBucket, '', testRegion)).rejects.toThrow(
        'S3 error'
      );
      expect(mockConsoleError).toHaveBeenCalledWith(expect.stringContaining('Backup failed'));
    });

    it('should use prefix when provided', async () => {
      const prefix = 'uploads/';
      s3ClientSendMock.mockResolvedValue({ Contents: [] });

      await backupS3ToLocal(localDir, testBucket, prefix, testRegion);

      expect(mockConsoleInfo).toHaveBeenCalledWith(
        expect.stringContaining(`Filtering by prefix: ${prefix}`)
      );
    });

    it('should handle objects with undefined Size and LastModified', async () => {
      s3ClientSendMock
        .mockResolvedValueOnce({
          Contents: [{ Key: 'file.jpg', Size: undefined, LastModified: undefined }],
          NextContinuationToken: undefined,
        })
        .mockResolvedValueOnce({ Body: { pipe: vi.fn() }, ContentType: 'image/jpeg' });

      const result = await backupS3ToLocal(localDir, testBucket, '', testRegion);

      expect(result.totalFiles).toBe(1);
      expect(result.files[0].size).toBe(0);
      expect(result.files[0].lastModified).toBe('');
    });

    it('should not warn when second page is empty after first page had results', async () => {
      // New: all listing happens first, then downloads
      s3ClientSendMock
        .mockResolvedValueOnce({
          Contents: [{ Key: 'file.jpg', Size: 100, LastModified: new Date() }],
          NextContinuationToken: 'next',
        })
        .mockResolvedValueOnce({ Contents: [], NextContinuationToken: undefined })
        .mockResolvedValueOnce({ Body: { pipe: vi.fn() }, ContentType: 'image/jpeg' });

      const result = await backupS3ToLocal(localDir, testBucket, '', testRegion);

      expect(result.totalFiles).toBe(1);
      // Should NOT warn about no objects since page 1 had results
      const warningCalls = mockConsoleWarn.mock.calls.map(([msg]) => String(msg));
      expect(warningCalls.some((msg) => msg.includes('No eligible media files'))).toBe(false);
    });

    it('should skip backup when nothing changed since last backup', async () => {
      const lastModified = new Date('2026-01-15T00:00:00Z');

      // S3 returns same files as previous backup
      s3ClientSendMock.mockResolvedValueOnce({
        Contents: [
          { Key: 'photo.jpg', Size: 1024, LastModified: lastModified },
          { Key: 'song.mp3', Size: 2048, LastModified: lastModified },
        ],
        NextContinuationToken: undefined,
      });

      // Previous backup metadata matches exactly
      const previousMetadata = JSON.stringify({
        timestamp: '2026-01-15T00:00:00Z',
        bucket: testBucket,
        prefix: '',
        region: testRegion,
        totalFiles: 2,
        totalSize: 3072,
        files: [
          { key: 'photo.jpg', size: 1024, lastModified: lastModified.toISOString() },
          { key: 'song.mp3', size: 2048, lastModified: lastModified.toISOString() },
        ],
      });

      // Setup: previous backup exists
      readdirSyncMock.mockReturnValue(['s3-2026-01-15T00-00-00']);
      statSyncMock.mockReturnValue({ isDirectory: () => true });
      existsSyncMock.mockReturnValue(true);
      readFileSyncMock.mockReturnValue(previousMetadata);

      const result = await backupS3ToLocal(localDir, testBucket, '', testRegion);

      // Should return empty metadata (no downloads)
      expect(result.totalFiles).toBe(0);
      expect(mockConsoleInfo).toHaveBeenCalledWith(
        expect.stringContaining('No changes detected since last backup')
      );
      // Should NOT write metadata or download files
      expect(writeFileSyncMock).not.toHaveBeenCalled();
    });

    it('should proceed with backup when files changed since last backup', async () => {
      const lastModified = new Date('2026-01-15T00:00:00Z');
      const newModified = new Date('2026-01-20T00:00:00Z');

      // S3 returns files with a different lastModified
      s3ClientSendMock
        .mockResolvedValueOnce({
          Contents: [{ Key: 'photo.jpg', Size: 1024, LastModified: newModified }],
          NextContinuationToken: undefined,
        })
        .mockResolvedValueOnce({ Body: { pipe: vi.fn() }, ContentType: 'image/jpeg' });

      // Previous backup has older lastModified
      const previousMetadata = JSON.stringify({
        timestamp: '2026-01-15T00:00:00Z',
        bucket: testBucket,
        prefix: '',
        region: testRegion,
        totalFiles: 1,
        totalSize: 1024,
        files: [{ key: 'photo.jpg', size: 1024, lastModified: lastModified.toISOString() }],
      });

      readdirSyncMock.mockReturnValue(['s3-2026-01-15T00-00-00']);
      statSyncMock.mockReturnValue({ isDirectory: () => true });
      readFileSyncMock.mockReturnValue(previousMetadata);

      const result = await backupS3ToLocal(localDir, testBucket, '', testRegion);

      expect(result.totalFiles).toBe(1);
      expect(mockConsoleInfo).toHaveBeenCalledWith(
        expect.stringContaining('Changes detected since last backup')
      );
    });

    it('should handle non-nested backup directory (localDir = "backups")', async () => {
      const nonNestedDir = 'backups';
      const lastModified = new Date('2026-01-15T00:00:00Z');

      // S3 returns same files as previous backup
      s3ClientSendMock.mockResolvedValueOnce({
        Contents: [{ Key: 'photo.jpg', Size: 1024, LastModified: lastModified }],
        NextContinuationToken: undefined,
      });

      // Previous backup metadata exists in a timestamped subdirectory
      const previousMetadata = JSON.stringify({
        timestamp: '2026-01-15T00:00:00Z',
        bucket: testBucket,
        prefix: '',
        region: testRegion,
        totalFiles: 1,
        totalSize: 1024,
        files: [{ key: 'photo.jpg', size: 1024, lastModified: lastModified.toISOString() }],
      });

      // Setup: previous backup exists in backups/s3-* subdirectory
      readdirSyncMock.mockReturnValue(['s3-2026-01-15T00-00-00']);
      statSyncMock.mockReturnValue({ isDirectory: () => true });
      existsSyncMock.mockReturnValue(true);
      readFileSyncMock.mockReturnValue(previousMetadata);

      const result = await backupS3ToLocal(nonNestedDir, testBucket, '', testRegion);

      // Should correctly find previous backup and skip download
      expect(result.totalFiles).toBe(0);
      expect(mockConsoleInfo).toHaveBeenCalledWith(
        expect.stringContaining('No changes detected since last backup')
      );
    });

    it('should handle non-nested backup directory with dot prefix (localDir = "./my-backup")', async () => {
      const nonNestedDir = './my-backup';
      const lastModified = new Date('2026-01-15T00:00:00Z');

      // S3 returns same files as previous backup
      s3ClientSendMock.mockResolvedValueOnce({
        Contents: [{ Key: 'photo.jpg', Size: 1024, LastModified: lastModified }],
        NextContinuationToken: undefined,
      });

      // Previous backup metadata exists
      const previousMetadata = JSON.stringify({
        timestamp: '2026-01-15T00:00:00Z',
        bucket: testBucket,
        prefix: '',
        region: testRegion,
        totalFiles: 1,
        totalSize: 1024,
        files: [{ key: 'photo.jpg', size: 1024, lastModified: lastModified.toISOString() }],
      });

      // Setup: previous backup exists
      readdirSyncMock.mockReturnValue(['s3-2026-01-15T00-00-00']);
      statSyncMock.mockReturnValue({ isDirectory: () => true });
      existsSyncMock.mockReturnValue(true);
      readFileSyncMock.mockReturnValue(previousMetadata);

      const result = await backupS3ToLocal(nonNestedDir, testBucket, '', testRegion);

      // Should correctly find previous backup and skip download
      expect(result.totalFiles).toBe(0);
      expect(mockConsoleInfo).toHaveBeenCalledWith(
        expect.stringContaining('No changes detected since last backup')
      );
    });

    it('should handle timestamped backup directory correctly (localDir = "backups/s3-2026-01-15")', async () => {
      const timestampedDir = 'backups/s3-2026-01-15T00-00-00';
      const lastModified = new Date('2026-01-15T00:00:00Z');

      // S3 returns files
      s3ClientSendMock
        .mockResolvedValueOnce({
          Contents: [{ Key: 'photo.jpg', Size: 1024, LastModified: lastModified }],
          NextContinuationToken: undefined,
        })
        .mockResolvedValueOnce({ Body: { pipe: vi.fn() }, ContentType: 'image/jpeg' });

      // No previous backup exists
      readdirSyncMock.mockReturnValue([]);
      statSyncMock.mockReturnValue({ isDirectory: () => true });
      existsSyncMock.mockReturnValue(false);

      const result = await backupS3ToLocal(timestampedDir, testBucket, '', testRegion);

      // Should proceed with backup since no previous backup found
      expect(result.totalFiles).toBe(1);
      expect(mockConsoleInfo).toHaveBeenCalledWith(
        expect.stringContaining('No previous backup found')
      );
    });
  });

  describe('restoreLocalToS3', () => {
    const testBucket = 'test-bucket';
    const testRegion = 'us-east-1';
    const localDir = '/test/backup';

    beforeEach(() => {
      existsSyncMock.mockReturnValue(true);
      readFileSyncMock.mockReturnValue('{}');
      s3ClientSendMock.mockReset().mockResolvedValue({});
    });

    it('should throw error if backup directory does not exist', async () => {
      existsSyncMock.mockReturnValue(false);

      await expect(restoreLocalToS3(localDir, testBucket, testRegion)).rejects.toThrow(
        'Backup directory not found'
      );
    });

    it('should restore files using metadata', async () => {
      const metadata = {
        timestamp: '2026-01-01T00:00:00Z',
        bucket: testBucket,
        prefix: '',
        region: testRegion,
        totalFiles: 2,
        totalSize: 3072,
        files: [
          {
            key: 'file1.txt',
            size: 1024,
            lastModified: '2026-01-01T00:00:00Z',
            contentType: 'text/plain',
          },
          {
            key: 'file2.txt',
            size: 2048,
            lastModified: '2026-01-01T00:00:00Z',
            contentType: 'text/plain',
          },
        ],
      };

      readFileSyncMock.mockReturnValue(JSON.stringify(metadata));
      statSyncMock.mockReturnValue({ size: 1024 });

      // HeadObject → 404 (not found), then PutObject → success, for each file
      s3ClientSendMock
        .mockRejectedValueOnce({ $metadata: { httpStatusCode: 404 } })
        .mockResolvedValueOnce({})
        .mockRejectedValueOnce({ $metadata: { httpStatusCode: 404 } })
        .mockResolvedValueOnce({});

      const result = await restoreLocalToS3(localDir, testBucket, testRegion, false);

      expect(result.successful).toBe(2);
      expect(result.failed).toBe(0);
      expect(result.skipped).toBe(0);
    });

    it('should restore without metadata file using directory scan', async () => {
      existsSyncMock.mockImplementation((path: string) => {
        if (typeof path === 'string' && path.includes('backup-metadata.json')) return false;
        return true;
      });

      readdirSyncMock.mockReturnValue(['file1.txt']);
      statSyncMock.mockReturnValue({ size: 1024, isDirectory: () => false });

      // HeadObject → 404, PutObject → success
      s3ClientSendMock
        .mockRejectedValueOnce({ $metadata: { httpStatusCode: 404 } })
        .mockResolvedValueOnce({});

      const result = await restoreLocalToS3(localDir, testBucket, testRegion, false);

      expect(result.successful).toBe(1);
      expect(mockConsoleWarn).toHaveBeenCalledWith(expect.stringContaining('No metadata found'));
    });

    it('should skip existing files when overwrite is false', async () => {
      const metadata = {
        timestamp: '2026-01-01T00:00:00Z',
        bucket: testBucket,
        prefix: '',
        region: testRegion,
        totalFiles: 1,
        totalSize: 1024,
        files: [{ key: 'file1.txt', size: 1024, lastModified: '2026-01-01T00:00:00Z' }],
      };

      readFileSyncMock.mockReturnValue(JSON.stringify(metadata));

      // HeadObject succeeds → file exists in S3
      s3ClientSendMock.mockResolvedValue({});

      const result = await restoreLocalToS3(localDir, testBucket, testRegion, false);

      expect(result.successful).toBe(0);
      expect(result.skipped).toBe(1);
      expect(mockConsoleWarn).toHaveBeenCalledWith(
        expect.stringContaining('Skipping (already exists)')
      );
    });

    it('should overwrite existing files when overwrite is true', async () => {
      const metadata = {
        timestamp: '2026-01-01T00:00:00Z',
        bucket: testBucket,
        prefix: '',
        region: testRegion,
        totalFiles: 1,
        totalSize: 1024,
        files: [{ key: 'file1.txt', size: 1024, lastModified: '2026-01-01T00:00:00Z' }],
      };

      readFileSyncMock.mockReturnValue(JSON.stringify(metadata));
      statSyncMock.mockReturnValue({ size: 1024 });

      // No HeadObject call when overwrite=true, just PutObject → success
      s3ClientSendMock.mockResolvedValue({});

      const result = await restoreLocalToS3(localDir, testBucket, testRegion, true);

      expect(result.successful).toBe(1);
      expect(result.skipped).toBe(0);
    });

    it('should skip files that do not exist locally', async () => {
      const metadata = {
        timestamp: '2026-01-01T00:00:00Z',
        bucket: testBucket,
        prefix: '',
        region: testRegion,
        totalFiles: 1,
        totalSize: 1024,
        files: [{ key: 'missing-file.txt', size: 1024, lastModified: '2026-01-01T00:00:00Z' }],
      };

      existsSyncMock.mockImplementation((path: string) => {
        if (typeof path === 'string' && path.includes('missing-file.txt')) return false;
        return true;
      });

      readFileSyncMock.mockReturnValue(JSON.stringify(metadata));

      const result = await restoreLocalToS3(localDir, testBucket, testRegion, false);

      expect(result.skipped).toBe(1);
      expect(mockConsoleWarn).toHaveBeenCalledWith(
        expect.stringContaining('File not found locally')
      );
    });

    it('should handle file upload errors', async () => {
      const metadata = {
        timestamp: '2026-01-01T00:00:00Z',
        bucket: testBucket,
        prefix: '',
        region: testRegion,
        totalFiles: 1,
        totalSize: 1024,
        files: [{ key: 'file1.txt', size: 1024, lastModified: '2026-01-01T00:00:00Z' }],
      };

      readFileSyncMock.mockReturnValue(JSON.stringify(metadata));
      statSyncMock.mockReturnValue({ size: 1024 });

      // HeadObject → 404, PutObject → error
      s3ClientSendMock
        .mockRejectedValueOnce({ $metadata: { httpStatusCode: 404 } })
        .mockRejectedValueOnce(new Error('Upload failed'));

      const result = await restoreLocalToS3(localDir, testBucket, testRegion, false);

      expect(result.failed).toBe(1);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].error).toBe('Upload failed');
      expect(mockConsoleError).toHaveBeenCalledWith(
        expect.stringContaining('Error uploading file1.txt')
      );
    });

    it('should handle corrupted metadata gracefully', async () => {
      existsSyncMock.mockImplementation((path: string) => {
        if (typeof path === 'string' && path.includes('backup-metadata.json')) return true;
        return true;
      });

      readFileSyncMock.mockReturnValue('invalid json');
      readdirSyncMock.mockReturnValue([]);

      const result = await restoreLocalToS3(localDir, testBucket, testRegion, false);

      expect(mockConsoleWarn).toHaveBeenCalledWith(
        expect.stringContaining('Could not read backup metadata')
      );
      expect(result.successful).toBe(0);
    });

    it('should handle directory traversal in restore directory scan', async () => {
      existsSyncMock.mockImplementation((path: string) => {
        if (typeof path === 'string' && path.includes('backup-metadata.json')) return false;
        return true;
      });

      readdirSyncMock.mockReturnValueOnce(['subdir']).mockReturnValueOnce(['file.txt']);

      statSyncMock.mockImplementation((pathArg: string) => ({
        size: 1024,
        isDirectory: () =>
          typeof pathArg === 'string' && pathArg.includes('subdir') && !pathArg.includes('file'),
      }));

      // HeadObject → 404, PutObject → success
      s3ClientSendMock
        .mockRejectedValueOnce({ $metadata: { httpStatusCode: 404 } })
        .mockResolvedValueOnce({});

      const result = await restoreLocalToS3(localDir, testBucket, testRegion, false);

      expect(result.successful).toBe(1);
    });

    it('should skip metadata file during directory scan', async () => {
      existsSyncMock.mockImplementation((path: string) => {
        if (typeof path === 'string' && path.includes('backup-metadata.json')) return false;
        return true;
      });

      readdirSyncMock.mockReturnValue(['backup-metadata.json', 'file.txt']);
      statSyncMock.mockReturnValue({ size: 1024, isDirectory: () => false });

      // HeadObject → 404, PutObject → success (only for file.txt)
      s3ClientSendMock
        .mockRejectedValueOnce({ $metadata: { httpStatusCode: 404 } })
        .mockResolvedValueOnce({});

      const result = await restoreLocalToS3(localDir, testBucket, testRegion, false);

      // Should only restore file.txt, not backup-metadata.json
      expect(result.successful).toBe(1);
    });

    it('should handle HeadObject permission errors (non-404)', async () => {
      const metadata = {
        timestamp: '2026-01-01T00:00:00Z',
        bucket: testBucket,
        prefix: '',
        region: testRegion,
        totalFiles: 1,
        totalSize: 1024,
        files: [{ key: 'file1.txt', size: 1024, lastModified: '2026-01-01T00:00:00Z' }],
      };

      readFileSyncMock.mockReturnValue(JSON.stringify(metadata));
      statSyncMock.mockReturnValue({ size: 1024 });

      // HeadObject returns 403 (permission error, not 404)
      s3ClientSendMock.mockRejectedValue({ $metadata: { httpStatusCode: 403 } });

      const result = await restoreLocalToS3(localDir, testBucket, testRegion, false);

      expect(result.failed).toBe(1);
      expect(result.errors[0].key).toBe('file1.txt');
    });

    it('should proceed when HeadObject returns NotFound by error Code', async () => {
      const metadata = {
        timestamp: '2026-01-01T00:00:00Z',
        bucket: testBucket,
        prefix: '',
        region: testRegion,
        totalFiles: 1,
        totalSize: 1024,
        files: [{ key: 'file1.txt', size: 1024, lastModified: '2026-01-01T00:00:00Z' }],
      };

      readFileSyncMock.mockReturnValue(JSON.stringify(metadata));
      statSyncMock.mockReturnValue({ size: 1024 });

      // HeadObject → Code: NotFound, PutObject → success
      s3ClientSendMock.mockRejectedValueOnce({ Code: 'NotFound' }).mockResolvedValueOnce({});

      const result = await restoreLocalToS3(localDir, testBucket, testRegion, false);

      expect(result.successful).toBe(1);
    });

    it('should proceed when HeadObject returns NoSuchKey by error name', async () => {
      const metadata = {
        timestamp: '2026-01-01T00:00:00Z',
        bucket: testBucket,
        prefix: '',
        region: testRegion,
        totalFiles: 1,
        totalSize: 1024,
        files: [{ key: 'file1.txt', size: 1024, lastModified: '2026-01-01T00:00:00Z' }],
      };

      readFileSyncMock.mockReturnValue(JSON.stringify(metadata));
      statSyncMock.mockReturnValue({ size: 1024 });

      // HeadObject → name: NoSuchKey, PutObject → success
      s3ClientSendMock.mockRejectedValueOnce({ name: 'NoSuchKey' }).mockResolvedValueOnce({});

      const result = await restoreLocalToS3(localDir, testBucket, testRegion, false);

      expect(result.successful).toBe(1);
    });

    it('should use content type from metadata when available', async () => {
      const metadata = {
        timestamp: '2026-01-01T00:00:00Z',
        bucket: testBucket,
        prefix: '',
        region: testRegion,
        totalFiles: 1,
        totalSize: 1024,
        files: [
          {
            key: 'file1.txt',
            size: 1024,
            lastModified: '2026-01-01T00:00:00Z',
            contentType: 'text/plain',
          },
        ],
      };

      readFileSyncMock.mockReturnValue(JSON.stringify(metadata));
      statSyncMock.mockReturnValue({ size: 1024 });

      // HeadObject → 404, PutObject → success
      s3ClientSendMock
        .mockRejectedValueOnce({ $metadata: { httpStatusCode: 404 } })
        .mockResolvedValueOnce({});

      await restoreLocalToS3(localDir, testBucket, testRegion, false);

      expect(putObjectCommandMock).toHaveBeenCalledWith(
        expect.objectContaining({
          ContentType: 'text/plain',
        })
      );
      // mime.getType should not be called when contentType is in metadata
      expect(mimeGetTypeMock).not.toHaveBeenCalled();
    });

    it('should determine content type from file extension via mime', async () => {
      const metadata = {
        timestamp: '2026-01-01T00:00:00Z',
        bucket: testBucket,
        prefix: '',
        region: testRegion,
        totalFiles: 1,
        totalSize: 1024,
        files: [{ key: 'photo.jpg', size: 1024, lastModified: '2026-01-01T00:00:00Z' }],
      };

      readFileSyncMock.mockReturnValue(JSON.stringify(metadata));
      statSyncMock.mockReturnValue({ size: 1024 });
      mimeGetTypeMock.mockReturnValue('image/jpeg');

      // HeadObject → 404, PutObject → success
      s3ClientSendMock
        .mockRejectedValueOnce({ $metadata: { httpStatusCode: 404 } })
        .mockResolvedValueOnce({});

      await restoreLocalToS3(localDir, testBucket, testRegion, false);

      expect(mimeGetTypeMock).toHaveBeenCalled();
      expect(putObjectCommandMock).toHaveBeenCalledWith(
        expect.objectContaining({
          ContentType: 'image/jpeg',
        })
      );
    });

    it('should fall back to application/octet-stream when mime returns null', async () => {
      const metadata = {
        timestamp: '2026-01-01T00:00:00Z',
        bucket: testBucket,
        prefix: '',
        region: testRegion,
        totalFiles: 1,
        totalSize: 1024,
        files: [{ key: 'file.unknown', size: 1024, lastModified: '2026-01-01T00:00:00Z' }],
      };

      readFileSyncMock.mockReturnValue(JSON.stringify(metadata));
      statSyncMock.mockReturnValue({ size: 1024 });
      mimeGetTypeMock.mockReturnValue(null);

      s3ClientSendMock
        .mockRejectedValueOnce({ $metadata: { httpStatusCode: 404 } })
        .mockResolvedValueOnce({});

      await restoreLocalToS3(localDir, testBucket, testRegion, false);

      expect(putObjectCommandMock).toHaveBeenCalledWith(
        expect.objectContaining({
          ContentType: 'application/octet-stream',
        })
      );
    });

    it('should skip files with invalid keys during restore', async () => {
      sanitizeFilePathMock.mockImplementation(() => {
        throw new Error('Invalid path');
      });

      const metadata = {
        timestamp: '2026-01-01T00:00:00Z',
        bucket: testBucket,
        prefix: '',
        region: testRegion,
        totalFiles: 1,
        totalSize: 1024,
        files: [{ key: '../escape.txt', size: 1024, lastModified: '2026-01-01T00:00:00Z' }],
      };

      readFileSyncMock.mockReturnValue(JSON.stringify(metadata));

      const result = await restoreLocalToS3(localDir, testBucket, testRegion, false);

      expect(result.skipped).toBe(1);
      expect(mockConsoleWarn).toHaveBeenCalledWith(
        expect.stringContaining('Skipping file with invalid key')
      );
    });

    it('should throw when directory scan fails with read error', async () => {
      existsSyncMock.mockImplementation((path: string) => {
        if (typeof path === 'string' && path.includes('backup-metadata.json')) return false;
        return true;
      });

      readdirSyncMock.mockImplementation(() => {
        throw new Error('Permission denied');
      });

      await expect(restoreLocalToS3(localDir, testBucket, testRegion, false)).rejects.toThrow(
        'Permission denied'
      );
      expect(mockConsoleError).toHaveBeenCalledWith(expect.stringContaining('Restore failed'));
    });

    it('should default to no-overwrite when overwrite parameter is omitted (upload command behavior)', async () => {
      const metadata = {
        timestamp: '2026-01-01T00:00:00Z',
        bucket: testBucket,
        prefix: '',
        region: testRegion,
        totalFiles: 1,
        totalSize: 1024,
        files: [{ key: 'file1.txt', size: 1024, lastModified: '2026-01-01T00:00:00Z' }],
      };

      readFileSyncMock.mockReturnValue(JSON.stringify(metadata));

      // HeadObject succeeds → file exists in S3, should be skipped
      s3ClientSendMock.mockResolvedValue({});

      // Call without overwrite parameter, matching: restoreLocalToS3(localDir, bucket, region)
      const result = await restoreLocalToS3(localDir, testBucket, testRegion);

      expect(result.successful).toBe(0);
      expect(result.skipped).toBe(1);
      expect(mockConsoleWarn).toHaveBeenCalledWith(
        expect.stringContaining('Skipping (already exists)')
      );
    });

    it('should log successful and failed counts after restore', async () => {
      const metadata = {
        timestamp: '2026-01-01T00:00:00Z',
        bucket: testBucket,
        prefix: '',
        region: testRegion,
        totalFiles: 2,
        totalSize: 2048,
        files: [
          { key: 'ok.txt', size: 1024, lastModified: '2026-01-01T00:00:00Z' },
          { key: 'fail.txt', size: 1024, lastModified: '2026-01-01T00:00:00Z' },
        ],
      };

      readFileSyncMock.mockReturnValue(JSON.stringify(metadata));
      statSyncMock.mockReturnValue({ size: 1024 });

      // ok.txt: HeadObject → 404, PutObject → success
      // fail.txt: HeadObject → 404, PutObject → error
      s3ClientSendMock
        .mockRejectedValueOnce({ $metadata: { httpStatusCode: 404 } })
        .mockResolvedValueOnce({})
        .mockRejectedValueOnce({ $metadata: { httpStatusCode: 404 } })
        .mockRejectedValueOnce(new Error('Upload error'));

      const result = await restoreLocalToS3(localDir, testBucket, testRegion, false);

      expect(result.successful).toBe(1);
      expect(result.failed).toBe(1);
      expect(mockConsoleInfo).toHaveBeenCalledWith(expect.stringContaining('Successful: 1'));
      expect(mockConsoleError).toHaveBeenCalledWith(expect.stringContaining('Failed: 1'));
    });
  });

  describe('listBackups', () => {
    beforeEach(() => {
      existsSyncMock.mockReturnValue(true);
    });

    it('should list available backups', () => {
      readdirSyncMock.mockReturnValue(['s3-2026-01-01T00-00-00', 's3-2026-01-02T00-00-00']);
      statSyncMock.mockReturnValue({ isDirectory: () => true });
      readFileSyncMock.mockReturnValue(
        JSON.stringify({
          timestamp: '2026-01-01T00:00:00Z',
          bucket: 'test-bucket',
          prefix: '',
          totalFiles: 10,
          totalSize: 1024000,
        })
      );

      listBackups('backups');

      expect(mockConsoleInfo).toHaveBeenCalledWith(expect.stringContaining('Found 2 S3 backup(s)'));
    });

    it('should handle no backups directory', () => {
      existsSyncMock.mockReturnValue(false);

      listBackups('backups');

      expect(mockConsoleWarn).toHaveBeenCalledWith(
        expect.stringContaining('No backups directory found')
      );
    });

    it('should handle empty backups directory', () => {
      readdirSyncMock.mockReturnValue([]);

      listBackups('backups');

      expect(mockConsoleWarn).toHaveBeenCalledWith(expect.stringContaining('No S3 backups found'));
    });

    it('should filter non-S3 backups', () => {
      readdirSyncMock.mockReturnValue(['s3-2026-01-01T00-00-00', 'mongo-backup', 'other-file']);
      statSyncMock.mockImplementation((path: string) => {
        if (typeof path === 'string' && path.includes('s3-')) return { isDirectory: () => true };
        return { isDirectory: () => false };
      });
      readFileSyncMock.mockReturnValue('{}');

      listBackups('backups');

      expect(mockConsoleInfo).toHaveBeenCalledWith(expect.stringContaining('Found 1 S3 backup(s)'));
    });

    it('should display metadata when available', () => {
      readdirSyncMock.mockReturnValue(['s3-2026-01-01T00-00-00']);
      statSyncMock.mockReturnValue({ isDirectory: () => true });
      readFileSyncMock.mockReturnValue(
        JSON.stringify({
          timestamp: '2026-01-01T00:00:00Z',
          bucket: 'my-bucket',
          prefix: 'uploads/',
          totalFiles: 42,
          totalSize: 5242880,
        })
      );

      listBackups('backups');

      expect(mockConsoleInfo).toHaveBeenCalledWith(expect.stringContaining('Bucket: my-bucket'));
      expect(mockConsoleInfo).toHaveBeenCalledWith(expect.stringContaining('Prefix: uploads/'));
      expect(mockConsoleInfo).toHaveBeenCalledWith(expect.stringContaining('Files: 42'));
    });

    it('should not display prefix line when prefix is empty', () => {
      readdirSyncMock.mockReturnValue(['s3-2026-01-01T00-00-00']);
      statSyncMock.mockReturnValue({ isDirectory: () => true });
      readFileSyncMock.mockReturnValue(
        JSON.stringify({
          timestamp: '2026-01-01T00:00:00Z',
          bucket: 'my-bucket',
          prefix: '',
          totalFiles: 10,
          totalSize: 1024,
        })
      );

      listBackups('backups');

      const infoCalls = mockConsoleInfo.mock.calls.map(([msg]) => String(msg));
      expect(infoCalls.some((msg) => msg.includes('Prefix:'))).toBe(false);
    });

    it('should handle corrupted metadata file', () => {
      readdirSyncMock.mockReturnValue(['s3-2026-01-01T00-00-00']);
      statSyncMock.mockReturnValue({ isDirectory: () => true });
      readFileSyncMock.mockImplementation(() => {
        throw new Error('Parse error');
      });

      listBackups('backups');

      expect(mockConsoleInfo).toHaveBeenCalledWith(
        expect.stringContaining('(metadata read error)')
      );
    });

    it('should handle missing metadata file', () => {
      readdirSyncMock.mockReturnValue(['s3-2026-01-01T00-00-00']);
      statSyncMock.mockReturnValue({ isDirectory: () => true });
      existsSyncMock.mockImplementation((path: string) => {
        if (typeof path === 'string' && path.includes('backup-metadata.json')) return false;
        return true;
      });

      listBackups('backups');

      expect(mockConsoleInfo).toHaveBeenCalledWith(expect.stringContaining('(no metadata)'));
    });

    it('should sort backups in reverse chronological order', () => {
      const backups = [
        's3-2026-01-01T00-00-00',
        's3-2026-01-03T00-00-00',
        's3-2026-01-02T00-00-00',
      ];
      readdirSyncMock.mockReturnValue(backups);
      statSyncMock.mockReturnValue({ isDirectory: () => true });
      existsSyncMock.mockImplementation((path: string) => {
        if (typeof path === 'string' && path.includes('backup-metadata.json')) return false;
        return true;
      });

      listBackups('backups');

      // Verify the most recent date appears before older ones in console output
      const infoMessages = mockConsoleInfo.mock.calls.flat().map(String);
      const idx03 = infoMessages.findIndex((m) => m.includes('s3-2026-01-03'));
      const idx02 = infoMessages.findIndex((m) => m.includes('s3-2026-01-02'));
      const idx01 = infoMessages.findIndex((m) => m.includes('s3-2026-01-01'));

      expect(idx03).toBeGreaterThan(-1);
      expect(idx02).toBeGreaterThan(-1);
      expect(idx01).toBeGreaterThan(-1);
      expect(idx03).toBeLessThan(idx02);
      expect(idx02).toBeLessThan(idx01);
    });
  });

  describe('cleanupOldBackups', () => {
    it('should return 0 when backup directory does not exist', () => {
      existsSyncMock.mockReturnValue(false);

      const deletedCount = cleanupOldBackups('backups', 5);

      expect(deletedCount).toBe(0);
      expect(readdirSyncMock).not.toHaveBeenCalled();
    });

    it('should return 0 when there are fewer backups than max', () => {
      existsSyncMock.mockReturnValue(true);
      readdirSyncMock.mockReturnValue(['s3-2023-01-01', 's3-2023-01-02', 's3-2023-01-03']);
      statSyncMock.mockReturnValue({ isDirectory: () => true });

      const deletedCount = cleanupOldBackups('backups', 5);

      expect(deletedCount).toBe(0);
      expect(unlinkSyncMock).not.toHaveBeenCalled();
      expect(rmdirSyncMock).not.toHaveBeenCalled();
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

      existsSyncMock.mockImplementation((path: string) => {
        // Return false for subdirs to skip actual deletion (deleteDirectory returns early)
        return typeof path === 'string' && path === 'backups';
      });
      readdirSyncMock.mockReturnValue(backups);
      statSyncMock.mockReturnValue({ isDirectory: () => true });

      const deletedCount = cleanupOldBackups('backups', 5);

      // Should delete 2 oldest backups (01-01 and 01-02)
      expect(deletedCount).toBe(2);
    });

    it('should keep exactly max backups', () => {
      const backups = [
        's3-2023-01-01T00-00-00',
        's3-2023-01-02T00-00-00',
        's3-2023-01-03T00-00-00',
        's3-2023-01-04T00-00-00',
        's3-2023-01-05T00-00-00',
      ];

      existsSyncMock.mockReturnValue(true);
      readdirSyncMock.mockReturnValue(backups);
      statSyncMock.mockReturnValue({ isDirectory: () => true });

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

      existsSyncMock.mockImplementation((path: string) => {
        return typeof path === 'string' && path === 'backups';
      });
      readdirSyncMock.mockReturnValue(items);
      statSyncMock.mockImplementation((path: string) => ({
        isDirectory: () => typeof path === 'string' && !path.includes('file.txt'),
      }));

      const deletedCount = cleanupOldBackups('backups', 2);

      // Only 3 s3- directories, should delete 1
      expect(deletedCount).toBe(1);
    });

    it('should handle errors when deleting backups', () => {
      const backups = [
        's3-2023-01-01T00-00-00',
        's3-2023-01-02T00-00-00',
        's3-2023-01-03T00-00-00',
      ];

      let firstCall = true;
      existsSyncMock.mockImplementation(() => {
        if (firstCall) {
          firstCall = false;
          return true;
        }
        throw new Error('Permission denied');
      });
      readdirSyncMock.mockReturnValue(backups);
      statSyncMock.mockReturnValue({ isDirectory: () => true });

      const deletedCount = cleanupOldBackups('backups', 1);

      // Should try to delete 2 but fail due to error
      expect(deletedCount).toBe(0);
    });

    it('should recursively delete backup directories with contents', () => {
      const backups = [
        's3-2023-01-01T00-00-00',
        's3-2023-01-02T00-00-00',
        's3-2023-01-03T00-00-00',
      ];

      existsSyncMock.mockReturnValue(true);

      // First call: list backups dir; Second: list oldest backup contents; Third: list subdir
      readdirSyncMock
        .mockReturnValueOnce(backups)
        .mockReturnValueOnce(['file1.txt', 'subdir'])
        .mockReturnValueOnce(['nested.txt']);

      statSyncMock.mockImplementation((pathArg: string) => ({
        isDirectory: () => {
          if (typeof pathArg !== 'string') return false;
          // Backup directories themselves
          if (backups.some((b) => pathArg.endsWith(b))) return true;
          // Nested subdir
          if (pathArg.endsWith('subdir')) return true;
          return false;
        },
      }));

      const deletedCount = cleanupOldBackups('backups', 2);

      expect(deletedCount).toBe(1);
      // Should have deleted files and directories
      expect(unlinkSyncMock).toHaveBeenCalledWith(expect.stringContaining('file1.txt'));
      expect(unlinkSyncMock).toHaveBeenCalledWith(expect.stringContaining('nested.txt'));
      expect(rmdirSyncMock).toHaveBeenCalledWith(expect.stringContaining('subdir'));
      expect(rmdirSyncMock).toHaveBeenCalledWith(expect.stringContaining('s3-2023-01-01T00-00-00'));
    });
  });

  describe('invalidateCloudFrontCache', () => {
    beforeEach(() => {
      cloudFrontSendMock.mockReset();
    });

    it('should skip invalidation when distribution ID is not set', async () => {
      const result = await invalidateCloudFrontCache('');

      expect(result).toBeNull();
      expect(cloudFrontSendMock).not.toHaveBeenCalled();
      expect(mockConsoleWarn).toHaveBeenCalledWith(
        expect.stringContaining('CLOUDFRONT_DISTRIBUTION_ID not set')
      );
    });

    it('should create invalidation and return invalidation ID', async () => {
      cloudFrontSendMock.mockResolvedValueOnce({
        Invalidation: { Id: 'INV123' },
      });

      const result = await invalidateCloudFrontCache('E2QCL9TEST', 'us-east-1');

      expect(result).toBe('INV123');
      expect(cloudFrontSendMock).toHaveBeenCalledTimes(1);
      expect(createInvalidationCommandMock).toHaveBeenCalledWith(
        expect.objectContaining({
          DistributionId: 'E2QCL9TEST',
          InvalidationBatch: expect.objectContaining({
            Paths: { Quantity: 1, Items: ['/*'] },
          }),
        })
      );
      expect(mockConsoleInfo).toHaveBeenCalledWith(
        expect.stringContaining('CloudFront invalidation created: INV123')
      );
    });

    it('should return null when response has no invalidation ID', async () => {
      cloudFrontSendMock.mockResolvedValueOnce({});

      const result = await invalidateCloudFrontCache('E2QCL9TEST', 'us-east-1');

      expect(result).toBeNull();
      expect(cloudFrontSendMock).toHaveBeenCalledTimes(1);
    });

    it('should throw and log error when CloudFront API fails', async () => {
      cloudFrontSendMock.mockRejectedValueOnce(new Error('Access Denied'));

      await expect(invalidateCloudFrontCache('E2QCL9TEST', 'us-east-1')).rejects.toThrow(
        'Access Denied'
      );
      expect(mockConsoleError).toHaveBeenCalledWith(
        expect.stringContaining('Failed to create CloudFront invalidation')
      );
    });
  });
});
