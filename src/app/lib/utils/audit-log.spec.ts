import { describe, it, expect, vi, beforeEach } from 'vitest';

import { logSecurityEvent, extractRequestMetadata, type AuditEvent } from './audit-log';

describe('Audit Log', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, 'info').mockImplementation(() => {});
    vi.spyOn(console, 'info').mockImplementation(() => {});
  });

  describe('logSecurityEvent', () => {
    it('should log security events with timestamp', () => {
      const consoleSpy = vi.spyOn(console, 'info');

      logSecurityEvent({
        event: 'auth.signin.success',
        userId: 'user123',
        email: 'test@example.com',
      });

      expect(consoleSpy).toHaveBeenCalled();
      const logCall = consoleSpy.mock.calls[0];
      expect(logCall[0]).toBe('[SECURITY_AUDIT]');
      expect(logCall[1]).toHaveProperty('event', 'auth.signin.success');
      expect(logCall[1]).toHaveProperty('userId', 'user123');
      expect(logCall[1]).toHaveProperty('email', 'test@example.com');
      expect(logCall[1]).toHaveProperty('timestamp');
      expect(logCall[1].timestamp).toBeInstanceOf(Date);
    });

    it('should log all audit event types', () => {
      const consoleSpy = vi.spyOn(console, 'info');
      const events: AuditEvent[] = [
        'auth.signin.success',
        'auth.signin.failed',
        'auth.signout',
        'auth.session.expired',
        'user.email.changed',
        'user.username.changed',
        'user.profile.updated',
        'user.created',
        'admin.access',
        'api.rate_limit.exceeded',
        'api.unauthorized_access',
      ];

      events.forEach((event) => {
        logSecurityEvent({ event });
      });

      expect(consoleSpy).toHaveBeenCalledTimes(events.length);
    });

    it('should include optional metadata', () => {
      const consoleSpy = vi.spyOn(console, 'info');
      const metadata = {
        action: 'update',
        previousValue: 'old@example.com',
        newValue: 'new@example.com',
      };

      logSecurityEvent({
        event: 'user.email.changed',
        userId: 'user123',
        metadata,
      });

      expect(consoleSpy).toHaveBeenCalled();
      const logCall = consoleSpy.mock.calls[0];
      expect(logCall[1]).toHaveProperty('metadata', metadata);
    });

    it('should include IP address when provided', () => {
      const consoleSpy = vi.spyOn(console, 'info');

      logSecurityEvent({
        event: 'auth.signin.success',
        userId: 'user123',
        ip: '192.168.1.1',
      });

      expect(consoleSpy).toHaveBeenCalled();
      const logCall = consoleSpy.mock.calls[0];
      expect(logCall[1]).toHaveProperty('ip', '192.168.1.1');
    });

    it('should include user agent when provided', () => {
      const consoleSpy = vi.spyOn(console, 'info');
      const userAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)';

      logSecurityEvent({
        event: 'auth.signin.success',
        userId: 'user123',
        userAgent,
      });

      expect(consoleSpy).toHaveBeenCalled();
      const logCall = consoleSpy.mock.calls[0];
      expect(logCall[1]).toHaveProperty('userAgent', userAgent);
    });

    it('should work without optional fields', () => {
      const consoleSpy = vi.spyOn(console, 'info');

      logSecurityEvent({
        event: 'api.rate_limit.exceeded',
      });

      expect(consoleSpy).toHaveBeenCalled();
      const logCall = consoleSpy.mock.calls[0];
      expect(logCall[1]).toHaveProperty('event', 'api.rate_limit.exceeded');
      expect(logCall[1]).toHaveProperty('timestamp');
    });

    it('should use JSON.stringify in production mode', () => {
      vi.stubEnv('NODE_ENV', 'production');
      const consoleInfoSpy = vi.spyOn(console, 'info');

      logSecurityEvent({
        event: 'auth.signin.success',
        userId: 'user123',
      });

      expect(consoleInfoSpy).toHaveBeenCalled();
      const logCall = consoleInfoSpy.mock.calls[0];
      expect(logCall[0]).toBe('[SECURITY_AUDIT]');
      expect(typeof logCall[1]).toBe('string');
      expect(() => JSON.parse(logCall[1] as string)).not.toThrow();

      vi.unstubAllEnvs();
    });
  });

  describe('extractRequestMetadata', () => {
    it('should extract IP from x-real-ip header', () => {
      const request = new Request('http://localhost:3000', {
        headers: {
          'x-real-ip': '192.168.1.1',
        },
      });

      const metadata = extractRequestMetadata(request);
      expect(metadata.ip).toBe('192.168.1.1');
    });

    it('should extract IP from x-forwarded-for header when x-real-ip is not present', () => {
      const request = new Request('http://localhost:3000', {
        headers: {
          'x-forwarded-for': '10.0.0.1, 192.168.1.1',
        },
      });

      const metadata = extractRequestMetadata(request);
      expect(metadata.ip).toBe('10.0.0.1, 192.168.1.1');
    });

    it('should prefer x-real-ip over x-forwarded-for', () => {
      const request = new Request('http://localhost:3000', {
        headers: {
          'x-real-ip': '192.168.1.1',
          'x-forwarded-for': '10.0.0.1',
        },
      });

      const metadata = extractRequestMetadata(request);
      expect(metadata.ip).toBe('192.168.1.1');
    });

    it('should extract user agent', () => {
      const userAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)';
      const request = new Request('http://localhost:3000', {
        headers: {
          'user-agent': userAgent,
        },
      });

      const metadata = extractRequestMetadata(request);
      expect(metadata.userAgent).toBe(userAgent);
    });

    it('should return undefined when headers are not present', () => {
      const request = new Request('http://localhost:3000');

      const metadata = extractRequestMetadata(request);
      expect(metadata.ip).toBeUndefined();
      expect(metadata.userAgent).toBeUndefined();
    });

    it('should handle both IP and user agent', () => {
      const userAgent = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)';
      const request = new Request('http://localhost:3000', {
        headers: {
          'x-real-ip': '192.168.1.100',
          'user-agent': userAgent,
        },
      });

      const metadata = extractRequestMetadata(request);
      expect(metadata.ip).toBe('192.168.1.100');
      expect(metadata.userAgent).toBe(userAgent);
    });

    it('should handle empty header values', () => {
      const request = new Request('http://localhost:3000', {
        headers: {
          'x-real-ip': '',
          'user-agent': '',
        },
      });

      const metadata = extractRequestMetadata(request);
      expect(metadata.ip).toBeUndefined();
      expect(metadata.userAgent).toBeUndefined();
    });
  });

  describe('Event Type Coverage', () => {
    it('should support all defined audit event types', () => {
      const consoleSpy = vi.spyOn(console, 'info');
      const eventTypes: AuditEvent[] = [
        'auth.signin.success',
        'auth.signin.failed',
        'auth.signout',
        'auth.session.expired',
        'user.email.changed',
        'user.username.changed',
        'user.profile.updated',
        'user.created',
        'admin.access',
        'api.rate_limit.exceeded',
        'api.unauthorized_access',
      ];

      eventTypes.forEach((eventType) => {
        logSecurityEvent({
          event: eventType,
          userId: 'test-user',
        });
      });

      expect(consoleSpy).toHaveBeenCalledTimes(eventTypes.length);
    });
  });
});
