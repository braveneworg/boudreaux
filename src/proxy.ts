/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

import { getToken } from 'next-auth/jwt';

import type { JWT } from 'next-auth/jwt';

type TokenUser = { role?: string };
type AuthToken = JWT | null;

// Public routes that don't require authentication
const PUBLIC_ROUTES = [
  /^\/$/, // Exact match for '/'
  /^\/signin/, // /login and sub-routes
  /^\/signup/, // /register and sub-routes
  /^\/signout/,
  /^\/success\/.*/, // /success/* with wildcard
  /^\/api\/auth/, // NextAuth.js API routes
  /^\/api\/health/, // Health check endpoint should be public
];

const PRIVATE_ROUTES = [
  /^\/profile/, // /profile and sub-routes
];

const isPublicRoute = (pathname: string): boolean =>
  PUBLIC_ROUTES.some((route) => route.test(pathname));

const isPrivateRoute = (pathname: string): boolean =>
  PRIVATE_ROUTES.some((route) => route.test(pathname));

/**
 * Resolve the session-token cookie name. Production uses the `__Secure-`
 * prefixed cookie, except under E2E where the insecure dev cookie is used.
 */
const resolveCookieName = (): string =>
  process.env.NODE_ENV === 'production' && process.env.E2E_MODE !== 'true'
    ? '__Secure-next-auth.session-token'
    : 'next-auth.session-token';

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
  token: AuthToken,
  callbackUrl: string | null,
  pathname: string
): NextResponse | null => {
  if (!token || !callbackUrl || callbackUrl === pathname || !isSafeCallbackUrl(callbackUrl)) {
    return null;
  }
  return NextResponse.redirect(new URL(callbackUrl, request.url));
};

/**
 * Role-based authorization for `/admin` routes. Returns a response when the
 * request must be short-circuited (redirect/403), or `null` to allow it.
 */
const handleAdminAuthorization = (
  request: NextRequest,
  token: AuthToken,
  pathname: string
): NextResponse | null => {
  /* v8 ignore start -- defensive: an unauthenticated /admin request is already
     redirected to /signin by the `!token && !isPublicRoute` guard above, so this
     branch is unreachable. Kept as defense-in-depth for the admin role check. */
  if (!token) {
    return NextResponse.redirect(new URL('/signin', request.url));
  }
  /* v8 ignore stop */

  const userRole = (token.user as TokenUser | null | undefined)?.role;
  if (userRole === 'admin') {
    return null;
  }

  // Log unauthorized access attempt (dynamic import for edge runtime compatibility)
  // Note: In production, integrate with your logging service
  console.warn('Unauthorized admin access attempt:', {
    userId: token.sub,
    attemptedPath: pathname,
    userRole: userRole ?? 'none',
    ip: request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip'),
    timestamp: new Date().toISOString(),
  });

  // Return 403 Forbidden instead of redirecting to signin
  // This prevents revealing the existence of admin routes
  return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
};

export default async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  const callbackUrl = request.nextUrl.searchParams.get('callbackUrl');
  const token = await getToken({
    req: request,
    secret: process.env.AUTH_SECRET,
    cookieName: resolveCookieName(),
  });

  const isPublic = isPublicRoute(pathname);

  // Redirect unauthenticated users trying to access private routes
  if (isPrivateRoute(pathname) && !token) {
    return buildSigninRedirect(request, pathname);
  }

  // Return early for public routes
  if (isPublic) {
    return NextResponse.next();
  }

  // Redirect to private callback url route if user is authenticated and has an explicit callbackUrl
  const callbackRedirect = buildCallbackRedirect(request, token, callbackUrl, pathname);
  if (callbackRedirect) {
    return callbackRedirect;
  }

  // Redirect unauthenticated users to signin page
  if (!token) {
    return buildSigninRedirect(request, pathname);
  }

  // Role-based authorization for admin routes
  if (pathname.startsWith('/admin')) {
    const adminResponse = handleAdminAuthorization(request, token, pathname);
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
     * - /admin and all sub-routes
     * - /api/admin and all sub-routes
     */
    '/profile',
    '/profile/:path*',
    '/admin',
    '/admin/:path*',
    '/api/admin/:path*',
  ],
};
