/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import 'server-only';

import type { NextRequest } from 'next/server';

/**
 * The minimal read surface this module needs from a headers source. Both the
 * mutable `Headers` of a `NextRequest` and Next's read-only `headers()` result
 * satisfy it, so callers can pass either without a cast.
 */
interface HeaderReader {
  get(name: string): string | null;
}

/**
 * Resolve the client IP from a Headers-like source. Prefers `x-real-ip`
 * (set by the reverse proxy) over `x-forwarded-for` to prevent client
 * spoofing of the first value.
 */
export const extractClientIpFromHeaders = (headers: HeaderReader): string =>
  headers.get('x-real-ip') || headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'anonymous';

/**
 * Resolve the client IP from a NextRequest. Thin wrapper over
 * extractClientIpFromHeaders for use in API route handlers.
 */
export const extractClientIp = (request: NextRequest): string =>
  extractClientIpFromHeaders(request.headers);
