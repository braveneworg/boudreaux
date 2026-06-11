/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import type * as loggerModule from './logger';

// Mock server-only to prevent client component error in tests
vi.mock('server-only', () => ({}));

const harness = vi.hoisted(() => {
  interface RecordedLog {
    level: string;
    message: unknown;
    meta: unknown;
    module: string;
  }
  interface RecordedOptions {
    level: string;
    defaultMeta: { service: string; module: string };
  }
  const logCalls: RecordedLog[] = [];
  const createdOptions: RecordedOptions[] = [];
  const printfTemplates: Array<(info: Record<string, unknown>) => string> = [];
  const instances: Record<string, { level: string }> = {};
  return { logCalls, createdOptions, printfTemplates, instances };
});

vi.mock('winston', () => {
  const makeLevelMethod =
    (level: string, module: string) =>
    (message: unknown, meta?: unknown): void => {
      harness.logCalls.push({ level, message, meta, module });
    };

  const createLogger = (options: {
    level: string;
    defaultMeta: { service: string; module: string };
  }): Record<string, unknown> => {
    harness.createdOptions.push(options);
    const module = options.defaultMeta.module;
    const instance = {
      level: options.level,
      debug: makeLevelMethod('debug', module),
      info: makeLevelMethod('info', module),
      warn: makeLevelMethod('warn', module),
      error: makeLevelMethod('error', module),
    };
    harness.instances[module] = instance;
    return instance;
  };

  const passthrough = (): Record<string, never> => ({});

  return {
    default: {
      createLogger,
      format: {
        combine: passthrough,
        colorize: passthrough,
        timestamp: passthrough,
        json: passthrough,
        printf: (template: (info: Record<string, unknown>) => string): Record<string, never> => {
          harness.printfTemplates.push(template);
          return {};
        },
      },
      transports: {
        Console: class MockConsoleTransport {},
      },
    },
  };
});

const importLogger = async (): Promise<typeof loggerModule> => {
  vi.resetModules();
  // The logger registry lives on globalThis and outlives vi.resetModules()
  delete (globalThis as { boudreauxLogState?: unknown }).boudreauxLogState;
  harness.logCalls.length = 0;
  harness.createdOptions.length = 0;
  harness.printfTemplates.length = 0;
  for (const key of Object.keys(harness.instances)) {
    delete harness.instances[key];
  }
  return import('./logger');
};

describe('Logger', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    delete process.env.LOG_LEVEL;
    delete process.env.LOG_DEBUG_MODULES;
    delete process.env.SHOW_DEV_LOGS;
  });

  describe('createLogger', () => {
    it('creates a winston logger tagged with the module name', async () => {
      const { createLogger } = await importLogger();
      const baseline = harness.createdOptions.length;
      createLogger('TEST_MODULE');

      expect(harness.createdOptions[baseline].defaultMeta).toEqual({
        service: 'boudreaux',
        module: 'TEST_MODULE',
      });
    });

    it('routes log calls through the module logger', async () => {
      const { createLogger } = await importLogger();
      const logger = createLogger('TEST_MODULE');
      logger.info('test message');

      expect(harness.logCalls).toContainEqual({
        level: 'info',
        message: 'test message',
        meta: undefined,
        module: 'TEST_MODULE',
      });
    });
  });

  describe('level resolution', () => {
    it('defaults to info in production', async () => {
      vi.stubEnv('NODE_ENV', 'production');
      const { createLogger } = await importLogger();
      createLogger('TEST');

      expect(harness.createdOptions.at(-1)?.level).toBe('info');
    });

    it('defaults to warn in development without SHOW_DEV_LOGS', async () => {
      vi.stubEnv('NODE_ENV', 'development');
      const { createLogger } = await importLogger();
      createLogger('TEST');

      expect(harness.createdOptions.at(-1)?.level).toBe('warn');
    });

    it('uses debug in development when SHOW_DEV_LOGS=true', async () => {
      vi.stubEnv('NODE_ENV', 'development');
      vi.stubEnv('SHOW_DEV_LOGS', 'true');
      const { createLogger } = await importLogger();
      createLogger('TEST');

      expect(harness.createdOptions.at(-1)?.level).toBe('debug');
    });

    it('honors a valid LOG_LEVEL override', async () => {
      vi.stubEnv('NODE_ENV', 'production');
      vi.stubEnv('LOG_LEVEL', 'error');
      const { createLogger } = await importLogger();
      createLogger('TEST');

      expect(harness.createdOptions.at(-1)?.level).toBe('error');
    });

    it('ignores an invalid LOG_LEVEL value', async () => {
      vi.stubEnv('NODE_ENV', 'production');
      vi.stubEnv('LOG_LEVEL', 'verbose');
      const { createLogger } = await importLogger();
      createLogger('TEST');

      expect(harness.createdOptions.at(-1)?.level).toBe('info');
    });

    it('enables debug for modules listed in LOG_DEBUG_MODULES', async () => {
      vi.stubEnv('NODE_ENV', 'production');
      vi.stubEnv('LOG_DEBUG_MODULES', ' CHAT , PRESIGNED_URLS ');
      const { createLogger } = await importLogger();
      createLogger('CHAT');
      createLogger('S3');

      const chatOptions = harness.createdOptions.find((o) => o.defaultMeta.module === 'CHAT');
      const s3Options = harness.createdOptions.find((o) => o.defaultMeta.module === 'S3');
      expect(chatOptions?.level).toBe('debug');
      expect(s3Options?.level).toBe('info');
    });
  });

  describe('log levels', () => {
    it('logs debug messages with redacted data', async () => {
      const { createLogger } = await importLogger();
      const logger = createLogger('TEST');
      logger.debug('debug message', { count: 42, apiKey: 'k' });

      expect(harness.logCalls.at(-1)).toEqual({
        level: 'debug',
        message: 'debug message',
        meta: { count: 42, apiKey: '[REDACTED]' },
        module: 'TEST',
      });
    });

    it('logs info messages without data', async () => {
      const { createLogger } = await importLogger();
      const logger = createLogger('TEST');
      logger.info('info message');

      expect(harness.logCalls.at(-1)).toEqual({
        level: 'info',
        message: 'info message',
        meta: undefined,
        module: 'TEST',
      });
    });

    it('logs warn messages with data', async () => {
      const { createLogger } = await importLogger();
      const logger = createLogger('TEST');
      logger.warn('warn with data', { reason: 'timeout' });

      expect(harness.logCalls.at(-1)).toEqual({
        level: 'warn',
        message: 'warn with data',
        meta: { reason: 'timeout' },
        module: 'TEST',
      });
    });

    it('logs error messages without an error object', async () => {
      const { createLogger } = await importLogger();
      const logger = createLogger('TEST');
      logger.error('error message');

      expect(harness.logCalls.at(-1)).toEqual({
        level: 'error',
        message: 'error message',
        meta: {},
        module: 'TEST',
      });
    });

    it('logs error with Error object including the stack trace', async () => {
      const { createLogger } = await importLogger();
      const logger = createLogger('TEST');
      const error = new Error('Test error');
      logger.error('error message', error);

      expect(harness.logCalls.at(-1)?.meta).toEqual({
        error: 'Test error',
        stack: expect.stringContaining('Error: Test error'),
      });
    });

    it('logs error with non-Error value', async () => {
      const { createLogger } = await importLogger();
      const logger = createLogger('TEST');
      logger.error('error message', 'string error');

      expect(harness.logCalls.at(-1)?.meta).toEqual({ error: 'string error' });
    });

    it('logs error with additional data', async () => {
      const { createLogger } = await importLogger();
      const logger = createLogger('TEST');
      logger.error('error occurred', new Error('Test error'), { userId: '123' });

      expect(harness.logCalls.at(-1)?.meta).toEqual({
        error: 'Test error',
        stack: expect.any(String),
        userId: '123',
      });
    });
  });

  describe('data redaction', () => {
    it('redacts sensitive fields from logged data', async () => {
      const { createLogger } = await importLogger();
      const logger = createLogger('TEST');
      logger.info('message with sensitive data', {
        username: 'john',
        password: 'secret123',
        myApiKey: 'key123',
        token: 'token123',
        normalField: 'visible',
      });

      expect(harness.logCalls.at(-1)?.meta).toEqual({
        username: 'john',
        password: '[REDACTED]',
        myApiKey: '[REDACTED]',
        token: '[REDACTED]',
        normalField: 'visible',
      });
    });

    it('redacts sensitive fields in nested objects', async () => {
      const { createLogger } = await importLogger();
      const logger = createLogger('TEST');
      logger.info('nested sensitive data', {
        user: { name: 'john', secretToken: 'abc123' },
      });

      expect(harness.logCalls.at(-1)?.meta).toEqual({
        user: { name: 'john', secretToken: '[REDACTED]' },
      });
    });

    it('redacts sensitive fields in arrays of objects', async () => {
      const { createLogger } = await importLogger();
      const logger = createLogger('TEST');
      logger.info('array data', {
        users: [
          { username: 'john', password: 'secret123' },
          { username: 'jane', token: 'token456' },
        ],
      });

      expect(harness.logCalls.at(-1)?.meta).toEqual({
        users: [
          { username: 'john', password: '[REDACTED]' },
          { username: 'jane', token: '[REDACTED]' },
        ],
      });
    });

    it('logs arrays of primitive values without modification', async () => {
      const { createLogger } = await importLogger();
      const logger = createLogger('TEST');
      logger.info('array of primitives', {
        ids: [1, 2, 3],
        names: ['alice', 'bob'],
      });

      expect(harness.logCalls.at(-1)?.meta).toEqual({
        ids: [1, 2, 3],
        names: ['alice', 'bob'],
      });
    });

    it('redacts sensitive fields in mixed arrays with objects', async () => {
      const { createLogger } = await importLogger();
      const logger = createLogger('TEST');
      logger.info('mixed array data', {
        items: [
          { id: 1, name: 'item1', apiKey: 'key123' },
          { id: 2, name: 'item2', secret: 'secret456' },
          'plain string',
          123,
        ],
      });

      expect(harness.logCalls.at(-1)?.meta).toEqual({
        items: [
          { id: 1, name: 'item1', apiKey: '[REDACTED]' },
          { id: 2, name: 'item2', secret: '[REDACTED]' },
          'plain string',
          123,
        ],
      });
    });

    it('redacts sensitive fields in deeply nested arrays', async () => {
      const { createLogger } = await importLogger();
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

      expect(harness.logCalls.at(-1)?.meta).toEqual({
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
      });
    });
  });

  describe('operation logging', () => {
    it('logs operation start', async () => {
      const { createLogger } = await importLogger();
      const logger = createLogger('TEST');
      logger.operationStart('testOperation');

      expect(harness.logCalls.at(-1)).toMatchObject({
        level: 'info',
        message: 'Starting: testOperation',
      });
    });

    it('logs operation complete', async () => {
      const { createLogger } = await importLogger();
      const logger = createLogger('TEST');
      logger.operationComplete('testOperation');

      expect(harness.logCalls.at(-1)).toMatchObject({
        level: 'info',
        message: 'Completed: testOperation',
      });
    });

    it('logs operation failed with error and data', async () => {
      const { createLogger } = await importLogger();
      const logger = createLogger('TEST');
      logger.operationFailed('testOperation', new Error('Operation failed'), { fileId: '123' });

      expect(harness.logCalls.at(-1)).toMatchObject({
        level: 'error',
        message: 'Failed: testOperation',
        meta: expect.objectContaining({ error: 'Operation failed', fileId: '123' }),
      });
    });
  });

  describe('development format', () => {
    it('renders a keyed human-readable line', async () => {
      vi.stubEnv('NODE_ENV', 'development');
      await importLogger();
      const template = harness.printfTemplates[0];

      const line = template({
        level: 'info',
        message: 'hello world',
        timestamp: '12:34:56.789',
        module: 'TEST',
        service: 'boudreaux',
        count: 2,
      });

      expect(line).toBe('12:34:56.789 info [TEST] hello world {"count":2}');
    });

    it('renders operation and omits empty meta', async () => {
      vi.stubEnv('NODE_ENV', 'development');
      await importLogger();
      const template = harness.printfTemplates[0];

      const line = template({
        level: 'warn',
        message: 'slow query',
        timestamp: '01:02:03.004',
        module: 'DATABASE',
        operation: 'findMany',
        service: 'boudreaux',
      });

      expect(line).toBe('01:02:03.004 warn [DATABASE] [findMany] slow query');
    });
  });

  describe('shouldSample', () => {
    it('always samples when oneInN is 1 or less', async () => {
      const { shouldSample } = await importLogger();

      expect(shouldSample('always', 1)).toBe(true);
      expect(shouldSample('always', 1)).toBe(true);
      expect(shouldSample('always', 0)).toBe(true);
    });

    it('logs the first occurrence then once every N calls', async () => {
      const { shouldSample } = await importLogger();

      const results = Array.from({ length: 7 }, () => shouldSample('sampled', 3));

      // first call, then every 3rd: 1st, 3rd, 6th
      expect(results).toEqual([true, false, true, false, false, true, false]);
    });

    it('tracks independent keys separately', async () => {
      const { shouldSample } = await importLogger();

      expect(shouldSample('key-a', 5)).toBe(true);
      expect(shouldSample('key-b', 5)).toBe(true);
      expect(shouldSample('key-a', 5)).toBe(false);
      expect(shouldSample('key-b', 5)).toBe(false);
    });
  });

  describe('runtime log-level override', () => {
    it('updates existing loggers and reports state', async () => {
      vi.stubEnv('NODE_ENV', 'production');
      const { createLogger, setRuntimeLogLevel, getLogLevelState } = await importLogger();
      createLogger('TEST');

      const state = setRuntimeLogLevel('debug');

      expect(harness.instances.TEST.level).toBe('debug');
      expect(state).toEqual({
        configuredLevel: 'info',
        override: 'debug',
        effectiveLevel: 'debug',
        expiresAt: null,
      });
      expect(getLogLevelState()).toEqual(state);
    });

    it('applies the active override to loggers created later', async () => {
      vi.stubEnv('NODE_ENV', 'production');
      const { createLogger, setRuntimeLogLevel } = await importLogger();

      setRuntimeLogLevel('error');
      createLogger('LATE_MODULE');

      const options = harness.createdOptions.find((o) => o.defaultMeta.module === 'LATE_MODULE');
      expect(options?.level).toBe('error');
    });

    it('never raises the AUDIT module above info', async () => {
      vi.stubEnv('NODE_ENV', 'production');
      const { loggers, setRuntimeLogLevel } = await importLogger();
      void loggers;

      setRuntimeLogLevel('error');

      expect(harness.instances.AUDIT.level).toBe('info');
    });

    it('resets to env-configured levels including LOG_DEBUG_MODULES', async () => {
      vi.stubEnv('NODE_ENV', 'production');
      vi.stubEnv('LOG_DEBUG_MODULES', 'CHAT');
      const { createLogger, setRuntimeLogLevel, getLogLevelState } = await importLogger();
      createLogger('CHAT');
      createLogger('S3');

      setRuntimeLogLevel('warn');
      expect(harness.instances.CHAT.level).toBe('warn');
      expect(harness.instances.S3.level).toBe('warn');

      setRuntimeLogLevel(null);
      expect(harness.instances.CHAT.level).toBe('debug');
      expect(harness.instances.S3.level).toBe('info');
      expect(getLogLevelState().override).toBeNull();
    });

    it('auto-reverts after the TTL elapses', async () => {
      vi.stubEnv('NODE_ENV', 'production');
      vi.useFakeTimers();
      try {
        const { createLogger, setRuntimeLogLevel, getLogLevelState } = await importLogger();
        createLogger('TEST');

        const state = setRuntimeLogLevel('debug', 60_000);
        expect(state.expiresAt).not.toBeNull();
        expect(harness.instances.TEST.level).toBe('debug');

        vi.advanceTimersByTime(60_001);

        expect(harness.instances.TEST.level).toBe('info');
        expect(getLogLevelState()).toEqual({
          configuredLevel: 'info',
          override: null,
          effectiveLevel: 'info',
          expiresAt: null,
        });
      } finally {
        vi.useRealTimers();
      }
    });

    it('replaces a pending TTL when a new override is applied', async () => {
      vi.stubEnv('NODE_ENV', 'production');
      vi.useFakeTimers();
      try {
        const { createLogger, setRuntimeLogLevel, getLogLevelState } = await importLogger();
        createLogger('TEST');

        setRuntimeLogLevel('debug', 60_000);
        setRuntimeLogLevel('warn'); // no TTL — previous timer must be cancelled

        vi.advanceTimersByTime(120_000);

        expect(getLogLevelState().override).toBe('warn');
      } finally {
        vi.useRealTimers();
      }
    });

    it('reuses the registered logger for repeated createLogger calls', async () => {
      const { createLogger } = await importLogger();
      createLogger('TEST');
      createLogger('TEST');

      const created = harness.createdOptions.filter((o) => o.defaultMeta.module === 'TEST');
      expect(created).toHaveLength(1);
    });
  });

  describe('pre-configured loggers', () => {
    it('provides pre-configured loggers for common modules', async () => {
      const { loggers } = await importLogger();

      expect(loggers.presignedUrls).toBeDefined();
      expect(loggers.auth).toBeDefined();
      expect(loggers.database).toBeDefined();
      expect(loggers.s3).toBeDefined();
      expect(loggers.notifications).toBeDefined();
      expect(loggers.stripe).toBeDefined();
      expect(loggers.downloads).toBeDefined();
      expect(loggers.payments).toBeDefined();
      expect(loggers.audit).toBeDefined();
      expect(loggers.http).toBeDefined();
    });

    it('logs with the correct module name', async () => {
      const { loggers } = await importLogger();
      loggers.downloads.info('test');

      expect(harness.logCalls.at(-1)?.module).toBe('DOWNLOADS');
    });
  });
});
