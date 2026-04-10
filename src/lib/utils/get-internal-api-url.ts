/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import 'server-only';

/**
 * Constructs an absolute URL for fetching internal API routes from Server Components.
 * Uses the NEXT_PUBLIC_BASE_URL environment variable as a trusted configuration source,
 * falling back to localhost:3000 for local development.
 *
 * Relying on request headers (host, x-forwarded-proto) is intentionally avoided to
 * prevent SSRF attacks where a forged Host header could redirect server-side requests
 * to an attacker-controlled domain and leak cookies or sensitive data.
 */
export function getInternalApiUrl(path: string): string {
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL ?? 'http://localhost:3000';
  return `${baseUrl}${path}`;
}
