/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

import { getCookieCache, getSessionCookie } from 'better-auth/cookies';

// Must match `advanced.cookiePrefix` in src/lib/auth.ts.
const COOKIE_PREFIX = 'boudreaux';

// Production uses secure cookies, except under E2E where the standalone server
// runs over plain HTTP. Must match `advanced.useSecureCookies` in src/lib/auth.ts.
const isSecureRuntime = (): boolean =>
  process.env.NODE_ENV === 'production' && process.env.E2E_MODE !== 'true';

// Public routes that don't require authentication
const PUBLIC_ROUTES = [
  /^\/$/, // Exact match for '/'
  /^\/signin/, // /signin and sub-routes
  /^\/signup/, // /signup and sub-routes
  /^\/signout/,
  /^\/success\/.*/, // /success/* with wildcard
  /^\/api\/auth/, // better-auth API routes
  /^\/api\/health/, // Health check endpoint should be public
];

const PRIVATE_ROUTES = [
  /^\/profile/, // /profile and sub-routes
  /^\/videos/, // /videos and sub-routes — signed-in-only listing
];

const isPublicRoute = (pathname: string): boolean =>
  PUBLIC_ROUTES.some((route) => route.test(pathname));

const isPrivateRoute = (pathname: string): boolean =>
  PRIVATE_ROUTES.some((route) => route.test(pathname));

/**
 * Same-origin guard for the `callbackUrl` redirect to prevent open-redirect
 * attacks: only a root-relative path (`/...`) that is not protocol-relative
 * (`//...`) is allowed.
 */
const isSafeCallbackUrl = (callbackUrl: string): boolean =>
  callbackUrl.startsWith('/') && !callbackUrl.startsWith('//');

/** Build a redirect to /signin preserving the attempted path as `callbackUrl`. */
const buildSigninRedirect = (request: NextRequest, pathname: string): NextResponse => {
  const signinUrl = new URL('/signin', request.url);
  signinUrl.searchParams.set('callbackUrl', pathname);
  return NextResponse.redirect(signinUrl);
};

/**
 * Redirect an authenticated user to an explicit, same-origin `callbackUrl`.
 * Returns the redirect response when one applies, or `null` to fall through.
 * Security: validates the `callbackUrl` is same-origin to prevent open-redirect.
 */
const buildCallbackRedirect = (
  request: NextRequest,
  hasSession: boolean,
  callbackUrl: string | null,
  pathname: string
): NextResponse | null => {
  if (!hasSession || !callbackUrl || callbackUrl === pathname || !isSafeCallbackUrl(callbackUrl)) {
    return null;
  }
  return NextResponse.redirect(new URL(callbackUrl, request.url));
};

/**
 * Read the cached session role from the better-auth cookie cache for the
 * optimistic edge gate. Returns `undefined` when there is no cache or it cannot
 * be read. Authoritative role enforcement stays server-side in `withAdmin`.
 */
const resolveCachedRole = async (request: NextRequest): Promise<string | undefined> => {
  const cached = await getCookieCache(request, {
    cookiePrefix: COOKIE_PREFIX,
    isSecure: isSecureRuntime(),
    secret: process.env.AUTH_SECRET,
  });
  // `user` carries our additional fields via the adapter's `Record<string, any>`.
  const role = cached?.user?.role;
  return typeof role === 'string' ? role : undefined;
};

/**
 * Role-based authorization for `/admin` routes. Returns a response when the
 * request must be short-circuited (403), or `null` to allow it. Assumes a
 * session cookie is already present (the unauth case is handled earlier).
 *
 * This is an OPTIMISTIC edge gate: it only blocks when the cookie cache yields a
 * definitive non-admin role. On a cache miss (`undefined` — cache expired,
 * absent, or unreadable) it falls through and lets the authoritative
 * server-side `withAdmin` check decide, so a valid admin is never hard-denied at
 * the edge just because the cache wasn't populated.
 */
const handleAdminAuthorization = async (
  request: NextRequest,
  pathname: string
): Promise<NextResponse | null> => {
  const userRole = await resolveCachedRole(request);
  // Admin via cache, or cache miss → allow through (authoritative check follows).
  if (userRole === 'admin' || userRole === undefined) {
    return null;
  }

  // Log unauthorized access attempt. Note: In production, integrate with your
  // logging service (the edge runtime keeps this minimal).
  console.warn('Unauthorized admin access attempt:', {
    attemptedPath: pathname,
    userRole,
    ip: request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip'),
    timestamp: new Date().toISOString(),
  });

  // Return 403 Forbidden instead of redirecting to signin. This prevents
  // revealing the existence of admin routes.
  return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
};

export default async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  const callbackUrl = request.nextUrl.searchParams.get('callbackUrl');
  // Presence-only check at the edge — cheap, no DB hit.
  const hasSession = Boolean(getSessionCookie(request, { cookiePrefix: COOKIE_PREFIX }));

  const isPublic = isPublicRoute(pathname);

  // Redirect unauthenticated users trying to access private routes
  if (isPrivateRoute(pathname) && !hasSession) {
    return buildSigninRedirect(request, pathname);
  }

  // Return early for public routes
  if (isPublic) {
    return NextResponse.next();
  }

  // Redirect authenticated users to an explicit same-origin callbackUrl
  const callbackRedirect = buildCallbackRedirect(request, hasSession, callbackUrl, pathname);
  if (callbackRedirect) {
    return callbackRedirect;
  }

  // Redirect unauthenticated users to signin page
  if (!hasSession) {
    return buildSigninRedirect(request, pathname);
  }

  // Role-based authorization for admin routes (optimistic; authoritative check
  // is server-side in withAdmin).
  if (pathname.startsWith('/admin')) {
    const adminResponse = await handleAdminAuthorization(request, pathname);
    if (adminResponse) {
      return adminResponse;
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * Match authentication-protected routes explicitly.
     * - /profile and all sub-routes
     * - /videos and all sub-routes
     * - /admin and all sub-routes
     * - /api/admin and all sub-routes
     */
    '/profile',
    '/profile/:path*',
    '/videos',
    '/videos/:path*',
    '/admin',
    '/admin/:path*',
    '/api/admin/:path*',
  ],
};
