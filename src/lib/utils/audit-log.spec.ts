/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { logSecurityEvent, extractRequestMetadata, type AuditEvent } from './audit-log';
import { loggers } from './logger';

vi.mock('server-only', () => ({}));

vi.mock('./logger', () => ({
  loggers: {
    audit: {
      info: vi.fn(),
    },
  },
}));

const auditInfo = vi.mocked(loggers.audit.info);

describe('Audit Log', () => {
  describe('logSecurityEvent', () => {
    it('should log security events through the AUDIT logger', () => {
      logSecurityEvent({
        event: 'auth.signin.success',
        userId: 'user123',
        email: 'test@example.com',
      });

      expect(auditInfo).toHaveBeenCalledWith('auth.signin.success', {
        event: 'auth.signin.success',
        userId: 'user123',
        email: 'test@example.com',
      });
    });

    it('should log all audit event types', () => {
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

      expect(auditInfo).toHaveBeenCalledTimes(events.length);
    });

    it('should include optional metadata', () => {
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

      expect(auditInfo).toHaveBeenCalledWith(
        'user.email.changed',
        expect.objectContaining({ metadata })
      );
    });

    it('should include IP address when provided', () => {
      logSecurityEvent({
        event: 'auth.signin.success',
        userId: 'user123',
        ip: '192.168.1.1',
      });

      expect(auditInfo).toHaveBeenCalledWith(
        'auth.signin.success',
        expect.objectContaining({ ip: '192.168.1.1' })
      );
    });

    it('should include user agent when provided', () => {
      const userAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)';

      logSecurityEvent({
        event: 'auth.signin.success',
        userId: 'user123',
        userAgent,
      });

      expect(auditInfo).toHaveBeenCalledWith(
        'auth.signin.success',
        expect.objectContaining({ userAgent })
      );
    });

    it('should work without optional fields', () => {
      logSecurityEvent({
        event: 'api.rate_limit.exceeded',
      });

      expect(auditInfo).toHaveBeenCalledWith('api.rate_limit.exceeded', {
        event: 'api.rate_limit.exceeded',
      });
    });

    it('should omit undefined optional fields from the payload', () => {
      logSecurityEvent({
        event: 'admin.access',
        userId: 'admin-1',
        email: undefined,
        ip: undefined,
      });

      expect(auditInfo).toHaveBeenCalledWith('admin.access', {
        event: 'admin.access',
        userId: 'admin-1',
      });
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

      expect(auditInfo).toHaveBeenCalledTimes(eventTypes.length);
    });

    it('should support all media audit event types', () => {
      const mediaEventTypes: AuditEvent[] = [
        'media.artist.created',
        'media.artist.found',
        'media.artist.updated',
        'media.artist.images.uploaded',
        'media.artist.images.reordered',
        'media.artist.image.deleted',
        'media.artist.image.updated',
        'media.featured_artist.created',
        'media.featured_artist.updated',
        'media.release.created',
        'media.release.updated',
        'media.release.found',
        'media.release.create_failed',
        'media.release.images.uploaded',
        'media.release.images.reordered',
        'media.release.image.deleted',
        'media.track.created',
        'media.track.updated',
        'media.tracks.bulk_created',
        'media.track.images.uploaded',
        'media.track.images.reordered',
        'media.track.image.deleted',
      ];

      mediaEventTypes.forEach((eventType) => {
        logSecurityEvent({
          event: eventType,
          userId: 'test-user',
        });
      });

      expect(auditInfo).toHaveBeenCalledTimes(mediaEventTypes.length);
    });

    it('should support all video audit event types', () => {
      const videoEventTypes: AuditEvent[] = [
        'media.video.created',
        'media.video.updated',
        'media.video.published',
        'media.video.unpublished',
        'media.video.archived',
        'media.video.restored',
        'media.video.deleted',
      ];

      videoEventTypes.forEach((eventType) => {
        logSecurityEvent({
          event: eventType,
          userId: 'test-user',
        });
      });

      expect(auditInfo).toHaveBeenCalledTimes(videoEventTypes.length);
    });

    it('should support notification banner audit event types', () => {
      const notificationEventTypes: AuditEvent[] = [
        'notification.banner.created',
        'notification.banner.updated',
        'notification.banner.deleted',
        'notification.banner.published',
        'notification.banner.unpublished',
      ];

      notificationEventTypes.forEach((eventType) => {
        logSecurityEvent({
          event: eventType,
          userId: 'test-user',
        });
      });

      expect(auditInfo).toHaveBeenCalledTimes(notificationEventTypes.length);
    });

    it('should support UI audit event types', () => {
      const uiEventTypes: AuditEvent[] = ['ui.artist.form.submitted'];

      uiEventTypes.forEach((eventType) => {
        logSecurityEvent({
          event: eventType,
          userId: 'test-user',
        });
      });

      expect(auditInfo).toHaveBeenCalledTimes(uiEventTypes.length);
    });

    it('should log media.artist.found with proper metadata', () => {
      logSecurityEvent({
        event: 'media.artist.found',
        userId: 'admin-123',
        metadata: {
          artistId: 'artist-456',
          artistName: 'Test Artist',
          searchedName: 'test artist',
          artistReleaseCreated: true,
        },
      });

      expect(auditInfo).toHaveBeenCalledWith(
        'media.artist.found',
        expect.objectContaining({
          event: 'media.artist.found',
          metadata: {
            artistId: 'artist-456',
            artistName: 'Test Artist',
            searchedName: 'test artist',
            artistReleaseCreated: true,
          },
        })
      );
    });

    it('should log media.tracks.bulk_created with proper metadata', () => {
      logSecurityEvent({
        event: 'media.tracks.bulk_created',
        userId: 'admin-123',
        metadata: {
          totalTracks: 10,
          successCount: 8,
          failedCount: 2,
          autoCreateRelease: true,
          releasesCreated: 1,
          artistsCreated: 2,
          artistReleasesCreated: true,
        },
      });

      expect(auditInfo).toHaveBeenCalledWith(
        'media.tracks.bulk_created',
        expect.objectContaining({
          event: 'media.tracks.bulk_created',
          metadata: expect.objectContaining({
            totalTracks: 10,
            successCount: 8,
            failedCount: 2,
            autoCreateRelease: true,
            artistsCreated: 2,
          }),
        })
      );
    });
  });
});
