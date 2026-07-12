/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import 'server-only';

/**
 * Decodes the `exp` claim from a JWT without verifying the signature.
 *
 * Used for observability only (Apple client secret expiry telemetry) — never
 * for trust decisions. Returns `null` for anything that is not a three-part
 * token with a JSON payload carrying a numeric `exp`; it never throws.
 */
export const decodeJwtExpiry = (token: string): Date | null => {
  const segments = token.split('.');
  if (segments.length !== 3) {
    return null;
  }
  try {
    const decoded: unknown = JSON.parse(Buffer.from(segments[1], 'base64url').toString('utf8'));
    if (typeof decoded !== 'object' || decoded === null) {
      return null;
    }
    const { exp } = decoded as { exp?: unknown };
    return typeof exp === 'number' ? new Date(exp * 1000) : null;
  } catch {
    return null;
  }
};
