import { describe, it, expect } from 'vitest';

import type { HealthStatus, HealthCheckResponse, HealthStatusType } from './health-status';

describe('Health Status Types', () => {
  describe('HealthStatusType', () => {
    it('should accept valid status values', () => {
      const validStatuses: HealthStatusType[] = ['healthy', 'unhealthy', 'error'];

      validStatuses.forEach((status) => {
        expect(status).toBeDefined();
        expect(['healthy', 'unhealthy', 'error']).toContain(status);
      });
    });
  });

  describe('HealthStatus', () => {
    it('should have correct structure with required fields', () => {
      const healthStatus: HealthStatus = {
        status: 'healthy',
        database: 'connected',
      };

      expect(healthStatus.status).toBe('healthy');
      expect(healthStatus.database).toBe('connected');
      expect(healthStatus.latency).toBeUndefined();
      expect(healthStatus.error).toBeUndefined();
    });

    it('should support optional latency field', () => {
      const healthStatus: HealthStatus = {
        status: 'healthy',
        database: 'connected',
        latency: 150,
      };

      expect(healthStatus.latency).toBe(150);
    });

    it('should support optional error field', () => {
      const healthStatus: HealthStatus = {
        status: 'error',
        database: 'disconnected',
        error: 'Connection timeout',
      };

      expect(healthStatus.error).toBe('Connection timeout');
    });

    it('should support all fields together', () => {
      const healthStatus: HealthStatus = {
        status: 'healthy',
        database: 'connected',
        latency: 50,
        error: undefined,
      };

      expect(healthStatus).toMatchObject({
        status: 'healthy',
        database: 'connected',
        latency: 50,
      });
    });
  });

  describe('HealthCheckResponse', () => {
    it('should extend HealthStatus with timestamp', () => {
      const timestamp = new Date();
      const response: HealthCheckResponse = {
        status: 'healthy',
        database: 'connected',
        timestamp,
      };

      expect(response.status).toBe('healthy');
      expect(response.database).toBe('connected');
      expect(response.timestamp).toBe(timestamp);
    });

    it('should support all optional fields from HealthStatus', () => {
      const timestamp = new Date();
      const response: HealthCheckResponse = {
        status: 'error',
        database: 'disconnected',
        latency: 200,
        error: 'Database timeout',
        timestamp,
      };

      expect(response).toMatchObject({
        status: 'error',
        database: 'disconnected',
        latency: 200,
        error: 'Database timeout',
        timestamp,
      });
    });
  });

  describe('Type Compatibility', () => {
    it('should allow HealthCheckResponse to be used as HealthStatus', () => {
      const response: HealthCheckResponse = {
        status: 'healthy',
        database: 'connected',
        timestamp: new Date(),
      };

      // This should compile without errors
      const healthStatus: HealthStatus = response;

      expect(healthStatus.status).toBe('healthy');
      expect(healthStatus.database).toBe('connected');
    });

    it('should enforce status type constraints', () => {
      const validStatuses: HealthStatusType[] = ['healthy', 'unhealthy', 'error'];

      validStatuses.forEach((status) => {
        const healthStatus: HealthStatus = {
          status,
          database: 'test',
        };

        expect(healthStatus.status).toBe(status);
      });
    });
  });

  describe('Error Cases', () => {
    it('should represent unhealthy status correctly', () => {
      const healthStatus: HealthStatus = {
        status: 'unhealthy',
        database: 'degraded',
        latency: 5000,
      };

      expect(healthStatus.status).toBe('unhealthy');
      expect(healthStatus.database).toBe('degraded');
      expect(healthStatus.latency).toBeGreaterThan(1000);
    });

    it('should represent error status correctly', () => {
      const healthStatus: HealthStatus = {
        status: 'error',
        database: 'failed',
        error: 'Connection refused',
      };

      expect(healthStatus.status).toBe('error');
      expect(healthStatus.database).toBe('failed');
      expect(healthStatus.error).toBeDefined();
    });
  });

  describe('Real-world Examples', () => {
    it('should handle successful health check response', () => {
      const response: HealthCheckResponse = {
        status: 'healthy',
        database: 'connected',
        latency: 25,
        timestamp: new Date('2025-10-19T12:00:00Z'),
      };

      expect(response.status).toBe('healthy');
      expect(response.database).toBe('connected');
      expect(response.latency).toBeLessThan(100);
      expect(response.timestamp).toBeInstanceOf(Date);
    });

    it('should handle failed health check response', () => {
      const response: HealthCheckResponse = {
        status: 'error',
        database: 'disconnected',
        error: 'Timeout after 30000ms',
        timestamp: new Date('2025-10-19T12:00:00Z'),
      };

      expect(response.status).toBe('error');
      expect(response.database).toBe('disconnected');
      expect(response.error).toContain('Timeout');
      expect(response.timestamp).toBeInstanceOf(Date);
    });

    it('should handle degraded health check response', () => {
      const response: HealthCheckResponse = {
        status: 'unhealthy',
        database: 'connected',
        latency: 3500,
        error: 'Slow response time',
        timestamp: new Date('2025-10-19T12:00:00Z'),
      };

      expect(response.status).toBe('unhealthy');
      expect(response.database).toBe('connected');
      expect(response.latency).toBeGreaterThan(3000);
      expect(response.error).toBeDefined();
      expect(response.timestamp).toBeInstanceOf(Date);
    });
  });
});
