/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { checkDatabaseHealth } from '@/lib/utils/database-utils';

import { GET } from './route';

// Import after mocking

// Mock the database-utils module
vi.mock('@/lib/utils/database-utils', () => ({
  checkDatabaseHealth: vi.fn(),
}));

describe('Health Check API', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('GET /api/health', () => {
    it('should return healthy status when database is connected', async () => {
      vi.mocked(checkDatabaseHealth).mockResolvedValue({
        healthy: true,
        latency: 25,
      });

      const response = await GET();
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.status).toBe('healthy');
      expect(data.database).toBe('connected');
      expect(data.latency).toBe(25);
      expect(data.timestamp).toBeDefined();
    });

    it('should return unhealthy status when database connection fails', async () => {
      vi.mocked(checkDatabaseHealth).mockResolvedValue({
        healthy: false,
        error: 'Connection timeout',
      });

      const response = await GET();
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data.status).toBe('unhealthy');
      expect(data.database).toBe('connection failed');
      expect(data.timestamp).toBeDefined();
    });

    it('should include error details in development mode', async () => {
      vi.stubEnv('NODE_ENV', 'development');

      vi.mocked(checkDatabaseHealth).mockResolvedValue({
        healthy: false,
        error: 'Connection refused',
      });

      const response = await GET();
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data.error).toBe('Connection refused');

      vi.unstubAllEnvs();
    });

    it('should not include error details in production mode', async () => {
      vi.stubEnv('NODE_ENV', 'production');

      vi.mocked(checkDatabaseHealth).mockResolvedValue({
        healthy: false,
        error: 'Connection refused',
      });

      const response = await GET();
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data.error).toBeUndefined();

      vi.unstubAllEnvs();
    });

    it('should handle unexpected errors gracefully', async () => {
      vi.mocked(checkDatabaseHealth).mockRejectedValue(Error('Unexpected error'));

      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      const response = await GET();
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data.status).toBe('unhealthy');
      expect(data.database).toBe('health check failed');
      expect(consoleErrorSpy).toHaveBeenCalled();

      consoleErrorSpy.mockRestore();
    });

    it('should handle non-Error exceptions', async () => {
      vi.mocked(checkDatabaseHealth).mockRejectedValue('String error');

      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      const response = await GET();
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data.status).toBe('unhealthy');

      consoleErrorSpy.mockRestore();
    });

    it('should include error message in development mode when catch block triggered with Error', async () => {
      vi.stubEnv('NODE_ENV', 'development');
      vi.mocked(checkDatabaseHealth).mockRejectedValue(new Error('Database connection failed'));

      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      const response = await GET();
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data.error).toBe('Database connection failed');

      consoleErrorSpy.mockRestore();
      vi.unstubAllEnvs();
    });

    it('should include generic error message in development mode for non-Error exceptions', async () => {
      vi.stubEnv('NODE_ENV', 'development');
      vi.mocked(checkDatabaseHealth).mockRejectedValue('String thrown error');

      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      const response = await GET();
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data.error).toBe('Unspecified error occurred');

      consoleErrorSpy.mockRestore();
      vi.unstubAllEnvs();
    });

    it('should not include error in production mode when catch block triggered', async () => {
      vi.stubEnv('NODE_ENV', 'production');
      vi.mocked(checkDatabaseHealth).mockRejectedValue(new Error('Sensitive error details'));

      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      const response = await GET();
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data.error).toBeUndefined();

      consoleErrorSpy.mockRestore();
      vi.unstubAllEnvs();
    });

    it('should include timestamp in ISO format', async () => {
      vi.mocked(checkDatabaseHealth).mockResolvedValue({
        healthy: true,
        latency: 10,
      });

      const response = await GET();
      const data = await response.json();

      expect(data.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    });

    it('should not require authentication', async () => {
      // This test verifies that the endpoint can be called without auth
      // The middleware should allow this route
      vi.mocked(checkDatabaseHealth).mockResolvedValue({
        healthy: true,
        latency: 15,
      });

      const response = await GET();

      expect(response.status).toBe(200);
      // No authentication headers should be required
    });

    it('should return valid JSON response', async () => {
      vi.mocked(checkDatabaseHealth).mockResolvedValue({
        healthy: true,
        latency: 20,
      });

      const response = await GET();
      const data = await response.json();

      expect(typeof data).toBe('object');
      expect(data).toHaveProperty('status');
      expect(data).toHaveProperty('database');
      expect(data).toHaveProperty('timestamp');
    });

    it('should measure latency correctly', async () => {
      const testLatency = 42;
      vi.mocked(checkDatabaseHealth).mockResolvedValue({
        healthy: true,
        latency: testLatency,
      });

      const response = await GET();
      const data = await response.json();

      expect(data.latency).toBe(testLatency);
    });

    it('should include no-cache headers in response', async () => {
      vi.mocked(checkDatabaseHealth).mockResolvedValue({
        healthy: true,
        latency: 25,
      });

      const response = await GET();

      expect(response.headers.get('Cache-Control')).toContain('no-store');
      expect(response.headers.get('Cache-Control')).toContain('no-cache');
      expect(response.headers.get('Pragma')).toBe('no-cache');
      expect(response.headers.get('Expires')).toBe('0');
    });

    it('should include no-cache headers in error response', async () => {
      vi.mocked(checkDatabaseHealth).mockResolvedValue({
        healthy: false,
        error: 'Connection failed',
      });

      const response = await GET();

      expect(response.headers.get('Cache-Control')).toContain('no-store');
      expect(response.headers.get('Cache-Control')).toContain('no-cache');
      expect(response.headers.get('Pragma')).toBe('no-cache');
      expect(response.headers.get('Expires')).toBe('0');
    });
  });
});
