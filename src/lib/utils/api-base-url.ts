/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Derive a stable API base URL.
 *
 * Rules:
 *  - Development: force http (avoids TLS overhead and self-signed hassles).
 *  - Production (server): prefer AUTH_URL if set; otherwise force https + host derived from env or request context.
 *  - Production (client): always use window.location.origin but ensure protocol is https (rewrite if user loaded over http accidentally).
 *
 * We never return http for production to avoid mixed content warnings.
 */
export function getApiBaseUrl(): string {
  const isDev = process.env.NODE_ENV === 'development';

  // Server-side context
  if (typeof window === 'undefined') {
    if (isDev) {
      return 'http://localhost:3000';
    }
    // Production server: use configured AUTH_URL if provided; otherwise synthesize https://fakefourrecords.com
    const envUrl = process.env.AUTH_URL?.trim();
    if (envUrl) {
      // Normalize any accidental http to https
      return envUrl.startsWith('http://') ? envUrl.replace('http://', 'https://') : envUrl;
    }
    // Fallback: hard-code domain with https to avoid downgrades
    return 'https://fakefourrecords.com';
  }

  // Client-side context
  const { hostname, port, protocol } = window.location;
  const localLike =
    hostname === 'localhost' ||
    hostname === '127.0.0.1' ||
    hostname.endsWith('.local') ||
    hostname.startsWith('192.168.') ||
    hostname.startsWith('10.') ||
    isDev;

  if (localLike) {
    return `http://${hostname}${port ? `:${port}` : ''}`;
  }

  // Enforce https in production client context (in case of proxy / misconfiguration)
  if (protocol === 'http:') {
    return `https://${hostname}${port ? `:${port}` : ''}`;
  }
  return window.location.origin;
}
