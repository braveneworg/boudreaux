/**
 * Security audit logging
 * Log security-sensitive operations for monitoring and forensics
 */

export type AuditEvent =
  | 'media.artist.created'
  | 'media.artist.updated'
  | 'media.artist.images.uploaded'
  | 'media.artist.images.reordered'
  | 'media.artist.image.deleted'
  | 'media.artist.image.updated'
  | 'media.group.created'
  | 'media.group.updated'
  | 'media.group.images.uploaded'
  | 'media.group.images.reordered'
  | 'media.group.image.deleted'
  | 'media.group.member.added'
  | 'media.group.member.removed'
  | 'media.release.created'
  | 'media.release.updated'
  | 'media.release.images.uploaded'
  | 'media.release.images.reordered'
  | 'media.release.image.deleted'
  | 'media.track.created'
  | 'media.track.updated'
  | 'media.track.images.uploaded'
  | 'media.track.images.reordered'
  | 'media.track.image.deleted'
  | 'auth.signin.success'
  | 'auth.signin.failed'
  | 'auth.signout'
  | 'auth.session.expired'
  | 'user.email.changed'
  | 'user.username.changed'
  | 'user.profile.updated'
  | 'user.created'
  | 'admin.access'
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
 * In production, this should write to a secure logging service
 */
export function logSecurityEvent(entry: Omit<AuditLogEntry, 'timestamp'>): void {
  const logEntry: AuditLogEntry = {
    ...entry,
    timestamp: new Date(),
  };

  // In production, send to logging service (e.g., CloudWatch, Datadog, etc.)
  if (process.env.NODE_ENV === 'production') {
    // TODO: Implement production logging
    console.info('[SECURITY_AUDIT]', JSON.stringify(logEntry));
  } else {
    console.info('[SECURITY_AUDIT]', logEntry);
  }

  // Consider also storing critical events in database for compliance
  if (shouldPersistEvent(entry.event)) {
    // TODO: Store in audit_logs table
  }
}

/**
 * Determine if event should be persisted to database
 */
function shouldPersistEvent(event: AuditEvent): boolean {
  const criticalEvents: AuditEvent[] = [
    'auth.signin.failed',
    'user.email.changed',
    'admin.access',
    'api.unauthorized_access',
  ];
  return criticalEvents.includes(event);
}

/**
 * Extract safe request metadata for logging
 */
export function extractRequestMetadata(request: Request): {
  ip?: string;
  userAgent?: string;
} {
  return {
    ip: request.headers.get('x-real-ip') || request.headers.get('x-forwarded-for') || undefined,
    userAgent: request.headers.get('user-agent') || undefined,
  };
}
