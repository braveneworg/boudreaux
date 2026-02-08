// Mock server-only to prevent client component error in tests
import { createLogger, loggers } from './logger';

vi.mock('server-only', () => ({}));

describe('Logger', () => {
  let consoleSpy: {
    info: ReturnType<typeof vi.spyOn>;
    warn: ReturnType<typeof vi.spyOn>;
    error: ReturnType<typeof vi.spyOn>;
  };

  beforeEach(() => {
    consoleSpy = {
      info: vi.spyOn(console, 'info').mockImplementation(() => {}),
      warn: vi.spyOn(console, 'warn').mockImplementation(() => {}),
      error: vi.spyOn(console, 'error').mockImplementation(() => {}),
    };
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('createLogger', () => {
    it('creates a logger with the specified module name', () => {
      const logger = createLogger('TEST_MODULE');
      logger.info('test message');

      expect(consoleSpy.info).toHaveBeenCalledWith(expect.stringContaining('[TEST_MODULE]'), '');
    });

    it('includes timestamp in log messages', () => {
      const logger = createLogger('TEST');
      logger.info('test message');

      expect(consoleSpy.info).toHaveBeenCalledWith(
        expect.stringMatching(/\[\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/),
        ''
      );
    });
  });

  describe('log levels', () => {
    it('debug method is defined', () => {
      const logger = createLogger('TEST');
      expect(logger.debug).toBeDefined();
      expect(typeof logger.debug).toBe('function');
    });

    it('logs info messages', () => {
      const logger = createLogger('TEST');
      logger.info('info message');

      expect(consoleSpy.info).toHaveBeenCalledWith(expect.stringContaining('[INFO]'), '');
    });

    it('logs warn messages', () => {
      const logger = createLogger('TEST');
      logger.warn('warning message');

      expect(consoleSpy.warn).toHaveBeenCalledWith(expect.stringContaining('[WARN]'), '');
    });

    it('logs error messages', () => {
      const logger = createLogger('TEST');
      logger.error('error message');

      expect(consoleSpy.error).toHaveBeenCalledWith(
        expect.stringContaining('[ERROR]'),
        expect.objectContaining({ error: 'undefined' })
      );
    });

    it('logs error with Error object', () => {
      const logger = createLogger('TEST');
      const error = new Error('Test error');
      logger.error('error message', error);

      expect(consoleSpy.error).toHaveBeenCalledWith(
        expect.stringContaining('[ERROR]'),
        expect.objectContaining({ error: 'Test error' })
      );
    });

    it('logs error with non-Error object', () => {
      const logger = createLogger('TEST');
      logger.error('error message', 'string error');

      expect(consoleSpy.error).toHaveBeenCalledWith(
        expect.stringContaining('[ERROR]'),
        expect.objectContaining({ error: 'string error' })
      );
    });
  });

  describe('data logging', () => {
    it('logs additional data with messages', () => {
      const logger = createLogger('TEST');
      logger.info('message with data', { username: 'john', count: 5 });

      expect(consoleSpy.info).toHaveBeenCalledWith(
        expect.stringContaining('[INFO]'),
        expect.objectContaining({ username: 'john', count: 5 })
      );
    });

    it('redacts sensitive fields from logged data', () => {
      const logger = createLogger('TEST');
      logger.info('message with sensitive data', {
        username: 'john',
        password: 'secret123',
        myApiKey: 'key123',
        token: 'token123',
        normalField: 'visible',
      });

      expect(consoleSpy.info).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          username: 'john',
          password: '[REDACTED]',
          myApiKey: '[REDACTED]',
          token: '[REDACTED]',
          normalField: 'visible',
        })
      );
    });

    it('redacts sensitive fields in nested objects', () => {
      const logger = createLogger('TEST');
      logger.info('nested sensitive data', {
        user: {
          name: 'john',
          secretToken: 'abc123',
        },
      });

      expect(consoleSpy.info).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          user: expect.objectContaining({
            name: 'john',
            secretToken: '[REDACTED]',
          }),
        })
      );
    });

    it('redacts sensitive fields in arrays of objects', () => {
      const logger = createLogger('TEST');
      logger.info('array data', {
        users: [
          { username: 'john', password: 'secret123' },
          { username: 'jane', token: 'token456' },
        ],
      });

      expect(consoleSpy.info).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          users: [
            { username: 'john', password: '[REDACTED]' },
            { username: 'jane', token: '[REDACTED]' },
          ],
        })
      );
    });

    it('logs arrays of primitive values without modification', () => {
      const logger = createLogger('TEST');
      logger.info('array of primitives', {
        ids: [1, 2, 3],
        names: ['alice', 'bob'],
      });

      expect(consoleSpy.info).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          ids: [1, 2, 3],
          names: ['alice', 'bob'],
        })
      );
    });

    it('redacts sensitive fields in mixed arrays with objects', () => {
      const logger = createLogger('TEST');
      logger.info('mixed array data', {
        items: [
          { id: 1, name: 'item1', apiKey: 'key123' },
          { id: 2, name: 'item2', secret: 'secret456' },
          'plain string',
          123,
        ],
      });

      expect(consoleSpy.info).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          items: [
            { id: 1, name: 'item1', apiKey: '[REDACTED]' },
            { id: 2, name: 'item2', secret: '[REDACTED]' },
            'plain string',
            123,
          ],
        })
      );
    });

    it('redacts sensitive fields in deeply nested arrays', () => {
      const logger = createLogger('TEST');
      logger.info('deeply nested array data', {
        departments: [
          {
            name: 'Engineering',
            users: [
              { username: 'alice', password: 'pass123' },
              { username: 'bob', apiKey: 'key456' },
            ],
          },
          {
            name: 'Sales',
            users: [{ username: 'charlie', token: 'token789' }],
          },
        ],
      });

      expect(consoleSpy.info).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          departments: [
            {
              name: 'Engineering',
              users: [
                { username: 'alice', password: '[REDACTED]' },
                { username: 'bob', apiKey: '[REDACTED]' },
              ],
            },
            {
              name: 'Sales',
              users: [{ username: 'charlie', token: '[REDACTED]' }],
            },
          ],
        })
      );
    });
  });

  describe('operation logging', () => {
    it('logs operation start', () => {
      const logger = createLogger('TEST');
      logger.operationStart('testOperation');

      expect(consoleSpy.info).toHaveBeenCalledWith(
        expect.stringContaining('Starting: testOperation'),
        ''
      );
    });

    it('logs operation complete', () => {
      const logger = createLogger('TEST');
      logger.operationComplete('testOperation');

      expect(consoleSpy.info).toHaveBeenCalledWith(
        expect.stringContaining('Completed: testOperation'),
        ''
      );
    });

    it('logs operation failed', () => {
      const logger = createLogger('TEST');
      const error = new Error('Operation failed');
      logger.operationFailed('testOperation', error);

      expect(consoleSpy.error).toHaveBeenCalledWith(
        expect.stringContaining('Failed: testOperation'),
        expect.objectContaining({ error: 'Operation failed' })
      );
    });

    it('logs operation failed with additional data', () => {
      const logger = createLogger('TEST');
      const error = new Error('Operation failed');
      logger.operationFailed('testOperation', error, { fileId: '123' });

      expect(consoleSpy.error).toHaveBeenCalledWith(
        expect.stringContaining('Failed: testOperation'),
        expect.objectContaining({
          error: 'Operation failed',
          fileId: '123',
        })
      );
    });
  });

  describe('pre-configured loggers', () => {
    it('provides pre-configured loggers for common modules', () => {
      expect(loggers.presignedUrls).toBeDefined();
      expect(loggers.auth).toBeDefined();
      expect(loggers.database).toBeDefined();
      expect(loggers.s3).toBeDefined();
      expect(loggers.notifications).toBeDefined();
    });

    it('presignedUrls logger logs with correct module name', () => {
      loggers.presignedUrls.info('test');

      expect(consoleSpy.info).toHaveBeenCalledWith(expect.stringContaining('[PRESIGNED_URLS]'), '');
    });

    it('auth logger logs with correct module name', () => {
      loggers.auth.info('test');

      expect(consoleSpy.info).toHaveBeenCalledWith(expect.stringContaining('[AUTH]'), '');
    });

    it('database logger logs with correct module name', () => {
      loggers.database.info('test');

      expect(consoleSpy.info).toHaveBeenCalledWith(expect.stringContaining('[DATABASE]'), '');
    });

    it('s3 logger logs with correct module name', () => {
      loggers.s3.info('test');

      expect(consoleSpy.info).toHaveBeenCalledWith(expect.stringContaining('[S3]'), '');
    });

    it('notifications logger logs with correct module name', () => {
      loggers.notifications.info('test');

      expect(consoleSpy.info).toHaveBeenCalledWith(expect.stringContaining('[NOTIFICATIONS]'), '');
    });
  });

  describe('error handling', () => {
    it('handles error logging with Error object', () => {
      const logger = createLogger('TEST');
      const error = new Error('Test error');
      logger.error('error occurred', error);

      expect(consoleSpy.error).toHaveBeenCalledWith(
        expect.stringContaining('[ERROR]'),
        expect.objectContaining({
          error: 'Test error',
        })
      );
    });

    it('handles error logging with string error', () => {
      const logger = createLogger('TEST');
      logger.error('error occurred', 'string error message');

      expect(consoleSpy.error).toHaveBeenCalledWith(
        expect.stringContaining('[ERROR]'),
        expect.objectContaining({
          error: 'string error message',
        })
      );
    });

    it('handles error logging with additional data', () => {
      const logger = createLogger('TEST');
      const error = new Error('Test error');
      logger.error('error occurred', error, { userId: '123' });

      expect(consoleSpy.error).toHaveBeenCalledWith(
        expect.stringContaining('[ERROR]'),
        expect.objectContaining({
          error: 'Test error',
          userId: '123',
        })
      );
    });
  });
});
