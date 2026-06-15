/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Fire-and-forget reporting of client-side errors to the server so they land
 * in the structured server logs. Sends only the error digest, a truncated
 * message, and the pathname — never stacks or user data.
 *
 * Must never throw: it runs inside error boundaries and query handlers.
 */
export const reportClientError = (
  error: Error & { digest?: string },
  boundary: 'route' | 'global' | 'response-validation'
): void => {
  const payload = {
    ...(error.digest ? { digest: error.digest } : {}),
    message: (error.message || 'Unknown client error').slice(0, 500),
    pathname: globalThis.location?.pathname ?? 'unknown',
    boundary,
  };

  try {
    void fetch('/api/client-errors', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      keepalive: true,
    }).catch(() => {
      // Swallow network failures — reporting must never surface its own error
    });
  } catch {
    // fetch may be unavailable in exotic environments; never throw
  }
};
