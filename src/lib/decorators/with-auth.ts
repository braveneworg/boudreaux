/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
// These decorators wrap API route handlers to enforce authentication and role-based access control.
// They can be used in the new Next.js App Router API routes (app/api/*/route.ts).

// Example usage:
// import { withAuth, withAdmin } from 'path/to/with-auth';
// export const GET = withAuth(async (req, res, session) => { ... });
// export const POST = withAdmin(async (req, res, session) => { ... });

import 'server-only';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

import { auth } from '@/auth';
import { extractRequestMetadata, logSecurityEvent } from '@/lib/utils/audit-log';
import { loggers } from '@/lib/utils/logger';
import { resolveRequestId, runWithRequestContext } from '@/lib/utils/request-context';

interface Session {
  user: {
    id: string;
    email: string;
    name: string;
    role: string;
    /** better-auth admin plugin: set to `true` when the account is banned. */
    banned?: boolean | null;
  };
}

type AuthenticatedHandler<TParams = unknown> = (
  request: NextRequest,
  context: { params: Promise<TParams> },
  session: Session
) => Promise<NextResponse> | NextResponse;

const logUnauthorized = (request: NextRequest, status: 401 | 403, userId?: string): void => {
  const { ip, userAgent } = extractRequestMetadata(request);
  loggers.auth.warn('Unauthorized API access', {
    status,
    path: request.nextUrl.pathname,
    method: request.method,
    ip,
    ...(userId !== undefined && { userId }),
  });
  logSecurityEvent({
    event: 'api.unauthorized_access',
    ...(userId !== undefined && { userId }),
    ip,
    userAgent,
    metadata: { status, path: request.nextUrl.pathname, method: request.method },
  });
};

// Authentication decorator
// Usage: Wrap API route handlers that require authentication
// Example: export const GET = withAuth(async (req, res, session) => { ... });
export const withAuth =
  <TParams = unknown>(handler: AuthenticatedHandler<TParams>) =>
  async (request: NextRequest, context: { params: Promise<unknown> }) =>
    runWithRequestContext(resolveRequestId(request.headers), async () => {
      const session = await auth();

      // Check authentication and validate session structure
      if (!session?.user?.id) {
        logUnauthorized(request, 401);
        return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
      }

      // Call the original handler with session
      return handler(request, context as { params: Promise<TParams> }, session as Session);
    });

// Admin role decorator
// Usage: Wrap API route handlers that require admin role
// Example: export const GET = withAdmin(async (req, res, session) => { ... });
export const withAdmin =
  <TParams = unknown>(handler: AuthenticatedHandler<TParams>) =>
  async (request: NextRequest, context: { params: Promise<unknown> }) =>
    runWithRequestContext(resolveRequestId(request.headers), async () => {
      const session = await auth();
      const role = 'admin';

      // Check authentication first and validate session structure
      if (!session?.user?.id) {
        logUnauthorized(request, 401);
        return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
      }

      // Check role authorization
      if (session.user?.role !== role) {
        logUnauthorized(request, 403, session.user.id);
        return NextResponse.json(
          { error: 'Insufficient permissions', required: role },
          { status: 403 }
        );
      }

      return handler(request, context as { params: Promise<TParams> }, session as Session);
    });
