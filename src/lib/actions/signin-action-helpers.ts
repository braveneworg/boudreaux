/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import 'server-only';

import { loggers } from '@/lib/utils/logger';

/**
 * Resolve the caller's IP for rate limiting from the forwarded headers,
 * preferring `x-real-ip`, then the first `x-forwarded-for` hop, then
 * `'anonymous'`. Mirrors the prior inline fallback chain exactly.
 */
export const resolveClientIp = (headersList: Headers): string =>
  headersList.get('x-real-ip') ||
  headersList.get('x-forwarded-for')?.split(',')[0]?.trim() ||
  'anonymous';

/**
 * Log a sign-in failure. In development the full error object is logged to aid
 * debugging; in production only the message (or `'Unknown error'` for
 * non-Error throws) is logged to avoid leaking details.
 */
export const logSigninError = (error: unknown): void => {
  if (process.env.NODE_ENV === 'development') {
    loggers.auth.error('Sign-in error', error);
    return;
  }

  loggers.auth.error('Sign-in error', error instanceof Error ? error.message : 'Unknown error');
};
