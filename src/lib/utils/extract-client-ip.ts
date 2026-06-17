/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import 'server-only';

import type { NextRequest } from 'next/server';

/**
 * Resolve the client IP from a Headers-like source. Prefers `x-real-ip`
 * (set by the reverse proxy) over `x-forwarded-for` to prevent client
 * spoofing of the first value.
 */
export const extractClientIpFromHeaders = (headers: Headers): string =>
  headers.get('x-real-ip') || headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'anonymous';

/**
 * Resolve the client IP from a NextRequest. Thin wrapper over
 * extractClientIpFromHeaders for use in API route handlers.
 */
export const extractClientIp = (request: NextRequest): string =>
  extractClientIpFromHeaders(request.headers);
