import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { validateEnvironment } from './env-validation';

describe('Environment Validation', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    // Reset environment before each test
    vi.resetModules();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    // Restore original environment
    process.env = originalEnv;
  });

  describe('validateEnvironment', () => {
    it('should pass validation with all required environment variables', () => {
      process.env = {
        ...process.env,
        DATABASE_URL: 'mongodb://localhost:27017/test',
        AUTH_SECRET: 'a'.repeat(32),
        NEXTAUTH_SECRET: 'b'.repeat(32),
        GOOGLE_CLIENT_ID: 'test-google-client-id',
        GOOGLE_CLIENT_SECRET: 'test-google-client-secret',
        EMAIL_SERVER_HOST: 'smtp.example.com',
        EMAIL_SERVER_USER: 'user@example.com',
        EMAIL_SERVER_PASSWORD: 'password123',
        EMAIL_FROM: 'noreply@example.com',
      };

      expect(() => validateEnvironment()).not.toThrow();
    });

    it('should throw error when DATABASE_URL is missing', () => {
      process.env = {
        ...process.env,
        DATABASE_URL: undefined,
        AUTH_SECRET: 'a'.repeat(32),
        NEXTAUTH_SECRET: 'b'.repeat(32),
        GOOGLE_CLIENT_ID: 'test-id',
        GOOGLE_CLIENT_SECRET: 'test-secret',
        EMAIL_SERVER_HOST: 'smtp.example.com',
        EMAIL_SERVER_USER: 'user@example.com',
        EMAIL_SERVER_PASSWORD: 'password',
        EMAIL_FROM: 'noreply@example.com',
      };

      expect(() => validateEnvironment()).toThrow(
        'Missing required environment variables: DATABASE_URL'
      );
    });

    it('should throw error when AUTH_SECRET is missing', () => {
      process.env = {
        ...process.env,
        DATABASE_URL: 'mongodb://localhost:27017/test',
        AUTH_SECRET: undefined,
        NEXTAUTH_SECRET: 'b'.repeat(32),
        GOOGLE_CLIENT_ID: 'test-id',
        GOOGLE_CLIENT_SECRET: 'test-secret',
        EMAIL_SERVER_HOST: 'smtp.example.com',
        EMAIL_SERVER_USER: 'user@example.com',
        EMAIL_SERVER_PASSWORD: 'password',
        EMAIL_FROM: 'noreply@example.com',
      };

      expect(() => validateEnvironment()).toThrow(
        'Missing required environment variables: AUTH_SECRET'
      );
    });

    it('should throw error when multiple variables are missing', () => {
      process.env = {
        ...process.env,
        DATABASE_URL: undefined,
        AUTH_SECRET: undefined,
        NEXTAUTH_SECRET: undefined,
        GOOGLE_CLIENT_ID: 'test-id',
        GOOGLE_CLIENT_SECRET: 'test-secret',
        EMAIL_SERVER_HOST: 'smtp.example.com',
        EMAIL_SERVER_USER: 'user@example.com',
        EMAIL_SERVER_PASSWORD: 'password',
        EMAIL_FROM: 'noreply@example.com',
      };

      expect(() => validateEnvironment()).toThrow(
        'Missing required environment variables: DATABASE_URL, AUTH_SECRET, NEXTAUTH_SECRET'
      );
    });

    it('should throw error when AUTH_SECRET is too short', () => {
      process.env = {
        ...process.env,
        DATABASE_URL: 'mongodb://localhost:27017/test',
        AUTH_SECRET: 'short',
        NEXTAUTH_SECRET: 'b'.repeat(32),
        GOOGLE_CLIENT_ID: 'test-id',
        GOOGLE_CLIENT_SECRET: 'test-secret',
        EMAIL_SERVER_HOST: 'smtp.example.com',
        EMAIL_SERVER_USER: 'user@example.com',
        EMAIL_SERVER_PASSWORD: 'password',
        EMAIL_FROM: 'noreply@example.com',
      };

      expect(() => validateEnvironment()).toThrow(
        'AUTH_SECRET must be at least 32 characters for security'
      );
    });

    it('should throw error when NEXTAUTH_SECRET is too short', () => {
      process.env = {
        ...process.env,
        DATABASE_URL: 'mongodb://localhost:27017/test',
        AUTH_SECRET: 'a'.repeat(32),
        NEXTAUTH_SECRET: 'short',
        GOOGLE_CLIENT_ID: 'test-id',
        GOOGLE_CLIENT_SECRET: 'test-secret',
        EMAIL_SERVER_HOST: 'smtp.example.com',
        EMAIL_SERVER_USER: 'user@example.com',
        EMAIL_SERVER_PASSWORD: 'password',
        EMAIL_FROM: 'noreply@example.com',
      };

      expect(() => validateEnvironment()).toThrow(
        'NEXTAUTH_SECRET must be at least 32 characters for security'
      );
    });

    it('should accept AUTH_SECRET with exactly 32 characters', () => {
      process.env = {
        ...process.env,
        DATABASE_URL: 'mongodb://localhost:27017/test',
        AUTH_SECRET: 'a'.repeat(32),
        NEXTAUTH_SECRET: 'b'.repeat(32),
        GOOGLE_CLIENT_ID: 'test-id',
        GOOGLE_CLIENT_SECRET: 'test-secret',
        EMAIL_SERVER_HOST: 'smtp.example.com',
        EMAIL_SERVER_USER: 'user@example.com',
        EMAIL_SERVER_PASSWORD: 'password',
        EMAIL_FROM: 'noreply@example.com',
      };

      expect(() => validateEnvironment()).not.toThrow();
    });

    it('should accept AUTH_SECRET with more than 32 characters', () => {
      process.env = {
        ...process.env,
        DATABASE_URL: 'mongodb://localhost:27017/test',
        AUTH_SECRET: 'a'.repeat(64),
        NEXTAUTH_SECRET: 'b'.repeat(64),
        GOOGLE_CLIENT_ID: 'test-id',
        GOOGLE_CLIENT_SECRET: 'test-secret',
        EMAIL_SERVER_HOST: 'smtp.example.com',
        EMAIL_SERVER_USER: 'user@example.com',
        EMAIL_SERVER_PASSWORD: 'password',
        EMAIL_FROM: 'noreply@example.com',
      };

      expect(() => validateEnvironment()).not.toThrow();
    });

    it('should warn when DATABASE_URL is not MongoDB', () => {
      const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      process.env = {
        ...process.env,
        DATABASE_URL: 'postgresql://localhost:5432/test',
        AUTH_SECRET: 'a'.repeat(32),
        NEXTAUTH_SECRET: 'b'.repeat(32),
        GOOGLE_CLIENT_ID: 'test-id',
        GOOGLE_CLIENT_SECRET: 'test-secret',
        EMAIL_SERVER_HOST: 'smtp.example.com',
        EMAIL_SERVER_USER: 'user@example.com',
        EMAIL_SERVER_PASSWORD: 'password',
        EMAIL_FROM: 'noreply@example.com',
      };

      validateEnvironment();

      expect(consoleWarnSpy).toHaveBeenCalledWith(
        'Warning: DATABASE_URL does not appear to be a MongoDB connection string'
      );
    });

    it('should validate MongoDB connection strings', () => {
      const mongoUrls = [
        'mongodb://localhost:27017/test',
        'mongodb+srv://user:pass@cluster.mongodb.net/dbname',
        'mongodb://user:password@host:27017/database',
      ];

      mongoUrls.forEach((url) => {
        process.env = {
          ...process.env,
          DATABASE_URL: url,
          AUTH_SECRET: 'a'.repeat(32),
          NEXTAUTH_SECRET: 'b'.repeat(32),
          GOOGLE_CLIENT_ID: 'test-id',
          GOOGLE_CLIENT_SECRET: 'test-secret',
          EMAIL_SERVER_HOST: 'smtp.example.com',
          EMAIL_SERVER_USER: 'user@example.com',
          EMAIL_SERVER_PASSWORD: 'password',
          EMAIL_FROM: 'noreply@example.com',
        };

        expect(() => validateEnvironment()).not.toThrow();
      });
    });

    it('should throw error for invalid EMAIL_SERVER_PORT', () => {
      process.env = {
        ...process.env,
        DATABASE_URL: 'mongodb://localhost:27017/test',
        AUTH_SECRET: 'a'.repeat(32),
        NEXTAUTH_SECRET: 'b'.repeat(32),
        GOOGLE_CLIENT_ID: 'test-id',
        GOOGLE_CLIENT_SECRET: 'test-secret',
        EMAIL_SERVER_HOST: 'smtp.example.com',
        EMAIL_SERVER_PORT: '99999',
        EMAIL_SERVER_USER: 'user@example.com',
        EMAIL_SERVER_PASSWORD: 'password',
        EMAIL_FROM: 'noreply@example.com',
      };

      expect(() => validateEnvironment()).toThrow(
        'EMAIL_SERVER_PORT must be a valid port number (1-65535)'
      );
    });

    it('should throw error for non-numeric EMAIL_SERVER_PORT', () => {
      process.env = {
        ...process.env,
        DATABASE_URL: 'mongodb://localhost:27017/test',
        AUTH_SECRET: 'a'.repeat(32),
        NEXTAUTH_SECRET: 'b'.repeat(32),
        GOOGLE_CLIENT_ID: 'test-id',
        GOOGLE_CLIENT_SECRET: 'test-secret',
        EMAIL_SERVER_HOST: 'smtp.example.com',
        EMAIL_SERVER_PORT: 'not-a-number',
        EMAIL_SERVER_USER: 'user@example.com',
        EMAIL_SERVER_PASSWORD: 'password',
        EMAIL_FROM: 'noreply@example.com',
      };

      expect(() => validateEnvironment()).toThrow(
        'EMAIL_SERVER_PORT must be a valid port number (1-65535)'
      );
    });

    it('should accept valid EMAIL_SERVER_PORT values', () => {
      const validPorts = ['25', '587', '465', '2525'];

      validPorts.forEach((port) => {
        process.env = {
          ...process.env,
          DATABASE_URL: 'mongodb://localhost:27017/test',
          AUTH_SECRET: 'a'.repeat(32),
          NEXTAUTH_SECRET: 'b'.repeat(32),
          GOOGLE_CLIENT_ID: 'test-id',
          GOOGLE_CLIENT_SECRET: 'test-secret',
          EMAIL_SERVER_HOST: 'smtp.example.com',
          EMAIL_SERVER_PORT: port,
          EMAIL_SERVER_USER: 'user@example.com',
          EMAIL_SERVER_PASSWORD: 'password',
          EMAIL_FROM: 'noreply@example.com',
        };

        expect(() => validateEnvironment()).not.toThrow();
      });
    });

    it('should log success message after validation', () => {
      const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      process.env = {
        ...process.env,
        DATABASE_URL: 'mongodb://localhost:27017/test',
        AUTH_SECRET: 'a'.repeat(32),
        NEXTAUTH_SECRET: 'b'.repeat(32),
        GOOGLE_CLIENT_ID: 'test-id',
        GOOGLE_CLIENT_SECRET: 'test-secret',
        EMAIL_SERVER_HOST: 'smtp.example.com',
        EMAIL_SERVER_USER: 'user@example.com',
        EMAIL_SERVER_PASSWORD: 'password',
        EMAIL_FROM: 'noreply@example.com',
      };

      validateEnvironment();

      expect(consoleLogSpy).toHaveBeenCalledWith('✅ Environment validation passed');
    });
  });
});
