/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
/**
 * Security audit logging
 * Log security-sensitive operations for monitoring and forensics
 *
 * Events are emitted through the structured Winston logger under the AUDIT
 * module, so in production they ship as JSON to Loki (queryable via
 * `{container="website"} | json | module="AUDIT"`). Logs are never persisted
 * to MongoDB.
 */
import { loggers } from './logger';

export type AuditEvent =
  | 'media.artist.created'
  | 'media.artist.found'
  | 'media.artist.updated'
  | 'media.artist.images.uploaded'
  | 'media.artist.images.reordered'
  | 'media.artist.image.deleted'
  | 'media.artist.image.updated'
  | 'media.featured_artist.created'
  | 'media.featured_artist.updated'
  | 'media.release.created'
  | 'media.release.updated'
  | 'media.release.found'
  | 'media.release.create_failed'
  | 'media.release.images.uploaded'
  | 'media.release.images.reordered'
  | 'media.release.image.deleted'
  | 'media.track.created'
  | 'media.track.updated'
  | 'media.tracks.bulk_created'
  | 'media.track.images.uploaded'
  | 'media.track.images.reordered'
  | 'media.track.image.deleted'
  | 'tour.created'
  | 'tour.updated'
  | 'tour.deleted'
  | 'tourDate.created'
  | 'tourDate.updated'
  | 'tourDate.deleted'
  | 'tourDateHeadliner.setTimeUpdated'
  | 'tourDateHeadliner.removed'
  | 'tourDateHeadliner.reordered'
  | 'venue.created'
  | 'venue.updated'
  | 'notification.banner.created'
  | 'notification.banner.updated'
  | 'notification.banner.deleted'
  | 'notification.banner.published'
  | 'notification.banner.unpublished'
  | 'auth.signin.success'
  | 'auth.signin.failed'
  | 'auth.signout'
  | 'auth.session.expired'
  | 'user.email.changed'
  | 'user.username.changed'
  | 'user.profile.updated'
  | 'user.created'
  | 'user.signup.duplicate_email_silent_signin'
  | 'admin.access'
  | 'admin.log_level.changed'
  | 'api.rate_limit.exceeded'
  | 'api.unauthorized_access'
  | 'ui.artist.form.submitted';

interface AuditLogEntry {
  event: AuditEvent;
  userId?: string;
  email?: string;
  ip?: string;
  userAgent?: string;
  metadata?: Record<string, unknown>;
  timestamp: Date;
}

/**
 * Log a security audit event
 * Emitted via the structured logger (timestamp is added by the logger)
 */
export const logSecurityEvent = (entry: Omit<AuditLogEntry, 'timestamp'>): void => {
  const { event, userId, email, ip, userAgent, metadata } = entry;

  loggers.audit.info(event, {
    event,
    ...(userId !== undefined && { userId }),
    ...(email !== undefined && { email }),
    ...(ip !== undefined && { ip }),
    ...(userAgent !== undefined && { userAgent }),
    ...(metadata !== undefined && { metadata }),
  });

  // Consider also storing critical events in database for compliance
  if (shouldPersistEvent(event)) {
    // TODO: Store in audit_logs table
  }
};

/**
 * Determine if event should be persisted to database
 */
const shouldPersistEvent = (event: AuditEvent): boolean => {
  const criticalEvents: AuditEvent[] = [
    'auth.signin.failed',
    'user.email.changed',
    'admin.access',
    'api.unauthorized_access',
  ];
  return criticalEvents.includes(event);
};

/**
 * Extract safe request metadata for logging
 */
export const extractRequestMetadata = (
  request: Request
): {
  ip?: string;
  userAgent?: string;
} => ({
  ip: request.headers.get('x-real-ip') || request.headers.get('x-forwarded-for') || undefined,
  userAgent: request.headers.get('user-agent') || undefined,
});
