/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import 'server-only';

import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

type RateLimiter = {
  check: (limit: number, token: string) => Promise<void>;
};

type RateLimitedHandler<TParams = unknown> = (
  request: NextRequest,
  context: { params: Promise<TParams> }
) => Promise<NextResponse> | NextResponse;

/**
 * Extract the client IP from the request headers.
 * Prefers x-real-ip (set by the reverse proxy) over x-forwarded-for
 * to prevent client-side header spoofing.
 */
export function extractClientIp(request: NextRequest): string {
  return (
    request.headers.get('x-real-ip') ||
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    'anonymous'
  );
}

/**
 * Higher-order function that wraps an API route handler with rate limiting.
 * Returns 429 when the rate limit is exceeded.
 *
 * @param limiter - A rate limiter instance from `rateLimit()`
 * @param limit - Maximum number of requests allowed per window
 */
export function withRateLimit<TParams = unknown>(limiter: RateLimiter, limit: number) {
  return (handler: RateLimitedHandler<TParams>) => {
    return async (request: NextRequest, context: { params: Promise<unknown> }) => {
      // Skip rate limiting in E2E test mode to avoid 429 errors during test runs
      if (process.env.E2E_MODE !== 'true') {
        const ip = extractClientIp(request);

        try {
          await limiter.check(limit, ip);
        } catch {
          return NextResponse.json(
            { error: 'Too many requests. Please try again later.' },
            { status: 429 }
          );
        }
      }

      return handler(request, context as { params: Promise<TParams> });
    };
  };
}
