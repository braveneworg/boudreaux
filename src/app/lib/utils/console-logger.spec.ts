import { error, log, LogMethods, warn } from './console-logger';

import type { SpyInstance } from 'vitest';

describe('console-logger', () => {
  let consoleInfoSpy: SpyInstance<Parameters<Console['info']>, ReturnType<Console['info']>>;
  let consoleWarnSpy: SpyInstance<Parameters<Console['warn']>, ReturnType<Console['warn']>>;
  let consoleErrorSpy: SpyInstance<Parameters<Console['error']>, ReturnType<Console['error']>>;

  beforeEach(() => {
    // Spy on console methods
    consoleInfoSpy = vi.spyOn(console, 'info').mockImplementation(() => {});
    consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    // Set environment to development for most tests
    vi.stubEnv('NODE_ENV', 'development');
  });

  afterEach(() => {
    // Restore console methods
    consoleInfoSpy.mockRestore();
    consoleWarnSpy.mockRestore();
    consoleErrorSpy.mockRestore();

    // Restore environment
    vi.unstubAllEnvs();
  });

  describe('LogMethods enum', () => {
    it('should have Info method', () => {
      expect(LogMethods.Info).toBe('info');
    });

    it('should have Warn method', () => {
      expect(LogMethods.Warn).toBe('warn');
    });

    it('should have Error method', () => {
      expect(LogMethods.Error).toBe('error');
    });

    it('should have three log methods', () => {
      const methods = Object.values(LogMethods);
      expect(methods.length).toBe(3);
    });

    it('should have lowercase method values', () => {
      Object.values(LogMethods).forEach((method) => {
        expect(method).toBe(method.toLowerCase());
      });
    });
  });

  describe('log function in development', () => {
    it('should log to console.info by default', () => {
      log('test message');

      expect(consoleInfoSpy).toHaveBeenCalledWith('test message');
    });

    it('should log multiple arguments', () => {
      log('message', 'arg1', 'arg2', 123);

      expect(consoleInfoSpy).toHaveBeenCalledWith('message', 'arg1', 'arg2', 123);
    });

    it('should log to console.warn when LogMethods.Warn is first arg', () => {
      log(LogMethods.Warn, 'warning message');

      expect(consoleWarnSpy).toHaveBeenCalledWith('warning message');
      expect(consoleInfoSpy).not.toHaveBeenCalled();
    });

    it('should log to console.error when LogMethods.Error is first arg', () => {
      log(LogMethods.Error, 'error message');

      expect(consoleErrorSpy).toHaveBeenCalledWith('error message');
      expect(consoleInfoSpy).not.toHaveBeenCalled();
    });

    it('should log to console.info when LogMethods.Info is first arg', () => {
      log(LogMethods.Info, 'info message');

      expect(consoleInfoSpy).toHaveBeenCalledWith('info message');
    });

    it('should handle objects and arrays', () => {
      const obj = { key: 'value' };
      const arr = [1, 2, 3];

      log('test', obj, arr);

      expect(consoleInfoSpy).toHaveBeenCalledWith('test', obj, arr);
    });

    it('should handle Error objects', () => {
      const testError = new Error('Test error');

      log(LogMethods.Error, testError);

      expect(consoleErrorSpy).toHaveBeenCalledWith(testError);
    });

    it('should handle null and undefined', () => {
      log('test', null, undefined);

      expect(consoleInfoSpy).toHaveBeenCalledWith('test', null, undefined);
    });
  });

  describe('log function in production', () => {
    beforeEach(() => {
      vi.unstubAllEnvs();
      vi.stubEnv('NODE_ENV', 'production');
    });

    it('should NOT log in production', () => {
      log('test message');

      expect(consoleInfoSpy).not.toHaveBeenCalled();
      expect(consoleWarnSpy).not.toHaveBeenCalled();
      expect(consoleErrorSpy).not.toHaveBeenCalled();
    });

    it('should NOT log warnings in production', () => {
      log(LogMethods.Warn, 'warning');

      expect(consoleWarnSpy).not.toHaveBeenCalled();
    });

    it('should NOT log errors in production', () => {
      log(LogMethods.Error, 'error');

      expect(consoleErrorSpy).not.toHaveBeenCalled();
    });
  });

  describe('warn function', () => {
    it('should log to console.warn', () => {
      warn('warning message');

      expect(consoleWarnSpy).toHaveBeenCalledWith('warning message');
      expect(consoleInfoSpy).not.toHaveBeenCalled();
    });

    it('should handle multiple arguments', () => {
      warn('warning', 'arg1', 'arg2');

      expect(consoleWarnSpy).toHaveBeenCalledWith('warning', 'arg1', 'arg2');
    });

    it('should handle objects', () => {
      const obj = { type: 'warning' };
      warn('Warning:', obj);

      expect(consoleWarnSpy).toHaveBeenCalledWith('Warning:', obj);
    });

    it('should NOT log warnings in production', () => {
      vi.unstubAllEnvs();
      vi.stubEnv('NODE_ENV', 'production');

      warn('warning');

      expect(consoleWarnSpy).not.toHaveBeenCalled();
    });
  });

  describe('error function', () => {
    it('should log to console.error', () => {
      error('error message');

      expect(consoleErrorSpy).toHaveBeenCalledWith('error message');
      expect(consoleInfoSpy).not.toHaveBeenCalled();
    });

    it('should handle multiple arguments', () => {
      error('error', 'arg1', 'arg2');

      expect(consoleErrorSpy).toHaveBeenCalledWith('error', 'arg1', 'arg2');
    });

    it('should handle Error objects', () => {
      const err = new Error('Test error');
      error(err);

      expect(consoleErrorSpy).toHaveBeenCalledWith(err);
    });

    it('should NOT log errors in production', () => {
      vi.unstubAllEnvs();
      vi.stubEnv('NODE_ENV', 'production');

      error('error');

      expect(consoleErrorSpy).not.toHaveBeenCalled();
    });
  });

  describe('edge cases', () => {
    it('should handle empty arguments', () => {
      log();

      expect(consoleInfoSpy).toHaveBeenCalledWith();
    });

    it('should handle only LogMethod argument', () => {
      log(LogMethods.Warn);

      expect(consoleWarnSpy).toHaveBeenCalledWith();
    });

    it('should handle special characters in strings', () => {
      log('Test\n\t\r');

      expect(consoleInfoSpy).toHaveBeenCalledWith('Test\n\t\r');
    });

    it('should handle Unicode characters', () => {
      log('Hello 🌍', '测试');

      expect(consoleInfoSpy).toHaveBeenCalledWith('Hello 🌍', '测试');
    });

    it('should handle symbols', () => {
      const sym = Symbol('test');
      log('Symbol:', sym);

      expect(consoleInfoSpy).toHaveBeenCalledWith('Symbol:', sym);
    });

    it('should handle functions', () => {
      const fn = () => 'test';
      log('Function:', fn);

      expect(consoleInfoSpy).toHaveBeenCalledWith('Function:', fn);
    });

    it('should handle Map and Set', () => {
      const map = new Map([['key', 'value']]);
      const set = new Set([1, 2, 3]);

      log('Collections:', map, set);

      expect(consoleInfoSpy).toHaveBeenCalledWith('Collections:', map, set);
    });
  });

  describe('integration scenarios', () => {
    it('should work with log prefixes from CONSTANTS', () => {
      const prefix = '[AuthToolbar]';
      log(prefix, 'User logged in');

      expect(consoleInfoSpy).toHaveBeenCalledWith(prefix, 'User logged in');
    });

    it('should work in try-catch blocks', () => {
      try {
        throw new Error('Test error');
      } catch (err) {
        error('Caught error:', err);
      }

      expect(consoleErrorSpy).toHaveBeenCalled();
    });

    it('should support debug logging patterns', () => {
      const debugData = { userId: 123, action: 'login' };
      log('Debug:', JSON.stringify(debugData, null, 2));

      expect(consoleInfoSpy).toHaveBeenCalled();
    });
  });
});
