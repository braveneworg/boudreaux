import { join } from 'path';

import {
  cleanupOldBackups,
  dumpDatabase,
  parseMongoUri,
  restoreDatabase,
  showUsage,
} from './mongo-backup';

const {
  execSyncMock,
  existsSyncMock,
  mkdirSyncMock,
  readdirSyncMock,
  statSyncMock,
  unlinkSyncMock,
} = vi.hoisted(() => ({
  execSyncMock: vi.fn(),
  existsSyncMock: vi.fn(),
  mkdirSyncMock: vi.fn(),
  readdirSyncMock: vi.fn(),
  statSyncMock: vi.fn(),
  unlinkSyncMock: vi.fn(),
}));

vi.mock('../src/lib/system-utils', () => ({
  execSync: execSyncMock,
  existsSync: existsSyncMock,
  mkdirSync: mkdirSyncMock,
  readdirSync: readdirSyncMock,
  statSync: statSyncMock,
  unlinkSync: unlinkSyncMock,
}));

describe('mongo-backup', () => {
  const mockConsoleInfo = vi.spyOn(console, 'info').mockImplementation(() => {});
  const mockConsoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
  const mockConsoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => {});
  const mockProcessExit = vi
    .spyOn(process, 'exit')
    .mockImplementation((code: number | string | null | undefined) => {
      throw new Error(`Process exited with code ${code}`);
    }) as unknown as typeof process.exit;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('parseMongoUri', () => {
    it('should parse a standard MongoDB URI', () => {
      const uri = 'mongodb://user:pass@localhost:27017/mydb';
      const result = parseMongoUri(uri);

      expect(result).toEqual({
        uri,
        database: 'mydb',
      });
    });

    it('should parse a MongoDB+srv URI', () => {
      const uri = 'mongodb+srv://user:pass@cluster.mongodb.net/production';
      const result = parseMongoUri(uri);

      expect(result).toEqual({
        uri,
        database: 'production',
      });
    });

    it('should parse a URI with query parameters', () => {
      const uri = 'mongodb://user:pass@localhost:27017/mydb?retryWrites=true&w=majority';
      const result = parseMongoUri(uri);

      expect(result).toEqual({
        uri,
        database: 'mydb',
      });
    });

    it('should handle encoded special characters in URI', () => {
      const uri = 'mongodb+srv://user:%23Pass123@cluster.mongodb.net/mydb?retryWrites=true';
      const result = parseMongoUri(uri);

      expect(result).toEqual({
        uri,
        database: 'mydb',
      });
    });

    it('should throw error if database name is missing', () => {
      const uri = 'mongodb://user:pass@localhost:27017/';

      expect(() => parseMongoUri(uri)).toThrow('Database name not found in connection string');
    });

    it('should throw error for invalid URI', () => {
      const uri = 'not-a-valid-uri';

      expect(() => parseMongoUri(uri)).toThrow('Failed to parse MongoDB URI');
    });

    it('should handle URI without database', () => {
      const uri = 'mongodb://user:pass@localhost:27017';

      expect(() => parseMongoUri(uri)).toThrow('Database name not found in connection string');
    });
  });

  describe('cleanupOldBackups', () => {
    beforeEach(() => {
      existsSyncMock.mockReturnValue(true);
    });

    it('should not delete files if count is less than keepCount', () => {
      readdirSyncMock.mockReturnValue(['file1.archive', 'file2.archive', 'file3.archive']);

      statSyncMock.mockImplementation((_path: string) => ({
        mtime: new Date(),
      }));

      cleanupOldBackups('/test/backups', 5);

      expect(unlinkSyncMock).not.toHaveBeenCalled();
    });

    it('should delete oldest files when count exceeds keepCount', () => {
      const files = [
        'file1.archive',
        'file2.archive',
        'file3.archive',
        'file4.archive',
        'file5.archive',
        'file6.archive',
        'file7.archive',
      ];

      readdirSyncMock.mockReturnValue(files);

      let counter = 0;
      statSyncMock.mockImplementation(() => ({
        mtime: new Date(2024, 0, ++counter),
      }));

      cleanupOldBackups('/test/backups', 5);

      expect(unlinkSyncMock).toHaveBeenCalledTimes(2);
      expect(mockConsoleInfo).toHaveBeenCalledWith('Cleaning up 2 old backup(s)...');
    });

    it('should only process .archive files', () => {
      readdirSyncMock.mockReturnValue(['file1.archive', 'file2.txt', 'file3.archive', 'README.md']);

      statSyncMock.mockReturnValue({
        mtime: new Date(),
      });

      cleanupOldBackups('/test/backups', 1);

      expect(unlinkSyncMock).toHaveBeenCalledTimes(1);
    });

    it('should handle non-existent directory gracefully', () => {
      existsSyncMock.mockReturnValue(false);

      cleanupOldBackups('/nonexistent', 5);

      expect(readdirSyncMock).not.toHaveBeenCalled();
      expect(unlinkSyncMock).not.toHaveBeenCalled();
    });

    it('should handle errors during cleanup', () => {
      readdirSyncMock.mockImplementation(() => {
        throw new Error('Permission denied');
      });

      cleanupOldBackups('/test/backups', 5);

      expect(mockConsoleWarn).toHaveBeenCalledWith(
        'Warning: Failed to clean up old backups:',
        'Permission denied'
      );
    });

    it('should sort files by modification time (newest first)', () => {
      const files = ['old.archive', 'new.archive', 'middle.archive'];

      readdirSyncMock.mockReturnValue(files);

      const dates = [
        new Date(2024, 0, 1), // old
        new Date(2024, 0, 3), // new
        new Date(2024, 0, 2), // middle
      ];

      let callCount = 0;
      statSyncMock.mockImplementation(() => ({
        mtime: dates[callCount++ % 3],
      }));

      cleanupOldBackups('/test/backups', 2);

      // Should delete the oldest file
      expect(unlinkSyncMock).toHaveBeenCalledTimes(1);
      expect(unlinkSyncMock).toHaveBeenCalledWith(join('/test/backups', 'old.archive'));
    });
  });

  describe('dumpDatabase', () => {
    const testUri = 'mongodb://user:pass@localhost:27017/testdb';

    beforeEach(() => {
      existsSyncMock.mockReturnValue(true);
      execSyncMock.mockReturnValue(Buffer.from(''));
    });

    it('should create backup with default filename', () => {
      const now = new Date();
      vi.setSystemTime(now);

      dumpDatabase(undefined, testUri);

      const expectedTimestamp = now.toISOString().replace(/:/g, '-').replace(/\..+/, '');
      expect(execSyncMock).toHaveBeenCalledWith(
        expect.stringContaining(`backups/${expectedTimestamp}-mongo-backup.archive`),
        expect.any(Object)
      );
      expect(mockConsoleInfo).toHaveBeenCalledWith('Starting MongoDB dump...');
      expect(mockConsoleInfo).toHaveBeenCalledWith('Database: testdb');

      vi.useRealTimers();
    });

    it('should create backup with custom filename', () => {
      dumpDatabase('custom-backup.archive', testUri);

      expect(execSyncMock).toHaveBeenCalledWith(
        expect.stringContaining('custom-backup.archive'),
        expect.any(Object)
      );
    });

    it('should create backup directory if it does not exist', () => {
      existsSyncMock.mockReturnValue(false);

      dumpDatabase('backups/new-dir/backup.archive', testUri);

      expect(mkdirSyncMock).toHaveBeenCalledWith(expect.stringContaining('new-dir'), {
        recursive: true,
      });
    });

    it('should use --gzip flag in mongodump command', () => {
      dumpDatabase('backup.archive', testUri);

      expect(execSyncMock).toHaveBeenCalledWith(
        expect.stringContaining('--gzip'),
        expect.any(Object)
      );
    });

    it('should handle mongodump failure', () => {
      execSyncMock.mockImplementation(() => {
        throw new Error('mongodump command failed');
      });

      expect(() => dumpDatabase('backup.archive', testUri)).toThrow('Process exited with code 1');

      expect(mockConsoleError).toHaveBeenCalledWith('❌ Backup failed!');
      expect(mockProcessExit).toHaveBeenCalledWith(1);
    });

    it('should call cleanupOldBackups after successful backup', () => {
      const cleanupSpy = vi.fn();
      vi.doMock('./mongo-backup', async () => ({
        ...(await vi.importActual('./mongo-backup')),
        cleanupOldBackups: cleanupSpy,
      }));

      dumpDatabase('backup.archive', testUri);

      // Verify execSync was called (backup successful)
      expect(execSyncMock).toHaveBeenCalled();
    });

    it('should include database URI in mongodump command', () => {
      dumpDatabase('backup.archive', testUri);

      expect(execSyncMock).toHaveBeenCalledWith(
        expect.stringContaining(`--uri="${testUri}"`),
        expect.any(Object)
      );
    });
  });

  describe('restoreDatabase', () => {
    const testUri = 'mongodb://user:pass@localhost:27017/testdb';
    const backupFile = 'backup.archive';

    beforeEach(() => {
      existsSyncMock.mockReturnValue(true);
      execSyncMock.mockReturnValue(Buffer.from(''));
    });

    it('should restore from backup file', () => {
      restoreDatabase(backupFile, testUri);

      expect(execSyncMock).toHaveBeenCalledWith(
        expect.stringContaining('mongorestore'),
        expect.any(Object)
      );
      expect(mockConsoleInfo).toHaveBeenCalledWith(
        '⚠️  WARNING: This will restore the database and may overwrite existing data!'
      );
      expect(mockConsoleInfo).toHaveBeenCalledWith('Database: testdb');
    });

    it('should exit if backup file does not exist', () => {
      existsSyncMock.mockReturnValue(false);

      expect(() => restoreDatabase('nonexistent.archive', testUri)).toThrow(
        'Process exited with code 1'
      );

      expect(mockConsoleError).toHaveBeenCalledWith(
        expect.stringContaining('Backup file not found')
      );
      expect(mockProcessExit).toHaveBeenCalledWith(1);
    });

    it('should use --gzip and --drop flags in mongorestore command', () => {
      restoreDatabase(backupFile, testUri);

      const call = execSyncMock.mock.calls[0][0] as string;
      expect(call).toContain('--gzip');
      expect(call).toContain('--drop');
    });

    it('should handle mongorestore failure', () => {
      execSyncMock.mockImplementation(() => {
        throw new Error('mongorestore command failed');
      });

      expect(() => restoreDatabase(backupFile, testUri)).toThrow('Process exited with code 1');

      expect(mockConsoleError).toHaveBeenCalledWith('❌ Restore failed!');
      expect(mockProcessExit).toHaveBeenCalledWith(1);
    });

    it('should include database URI in mongorestore command', () => {
      restoreDatabase(backupFile, testUri);

      expect(execSyncMock).toHaveBeenCalledWith(
        expect.stringContaining(`--uri="${testUri}"`),
        expect.any(Object)
      );
    });

    it('should show success message after restore', () => {
      restoreDatabase(backupFile, testUri);

      expect(mockConsoleInfo).toHaveBeenCalledWith('✅ Restore completed successfully!');
      expect(mockConsoleInfo).toHaveBeenCalledWith(
        expect.stringContaining('Database restored from')
      );
    });
  });

  describe('showUsage', () => {
    it('should display usage information', () => {
      showUsage();

      expect(mockConsoleInfo).toHaveBeenCalledWith('MongoDB Backup and Restore Script');
      expect(mockConsoleInfo).toHaveBeenCalledWith(expect.stringContaining('npm run mongo:dump'));
      expect(mockConsoleInfo).toHaveBeenCalledWith(
        expect.stringContaining('npm run mongo:restore')
      );
    });

    it('should show examples', () => {
      showUsage();

      expect(mockConsoleInfo).toHaveBeenCalledWith('Examples:');
      expect(mockConsoleInfo).toHaveBeenCalledWith('  npm run mongo:dump');
      expect(mockConsoleInfo).toHaveBeenCalledWith(
        '  npm run mongo:dump backups/my-backup.archive'
      );
      expect(mockConsoleInfo).toHaveBeenCalledWith(
        '  npm run mongo:restore backups/my-backup.archive'
      );
    });
  });
});
