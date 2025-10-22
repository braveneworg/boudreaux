import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

import { getToken } from 'next-auth/jwt';

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  const callbackUrl = request.nextUrl.searchParams.get('callbackUrl');
  const token = await getToken({
    req: request,
    secret: process.env.AUTH_SECRET,
  });

  // Public routes that don't require authentication
  const publicRoutes = [
    /^\/$/, // Exact match for '/'
    /^\/signin/, // /login and sub-routes
    /^\/signup/, // /register and sub-routes
    /^\/signout/,
    /^\/success\/.*/, // /success/* with wildcard
    /^\/api\/health/, // Health check endpoint should be public
  ];
  const isPublicRoute = publicRoutes.some((route) => route.test(pathname));
  const privateRoutes = [
    /^\/profile/, // /profile and sub-routes
  ];
  const isPrivateRoute = privateRoutes.some((route) => route.test(pathname));

  // Redirect unauthenticated users trying to access private routes
  if (isPrivateRoute && !token) {
    const signinUrl = new URL('/signin', request.url);
    signinUrl.searchParams.set('callbackUrl', pathname);
    return NextResponse.redirect(signinUrl);
  }

  // Return early for public routes
  if (isPublicRoute) {
    return NextResponse.next();
  }

  // Redirect to private callback url route if user is authenticated and has an explicit callbackUrl
  if (token && callbackUrl && callbackUrl !== pathname) {
    return NextResponse.redirect(new URL(callbackUrl, request.url));
  }

  // Redirect unauthenticated users to signin page
  if (!token && !isPublicRoute) {
    const signinUrl = new URL('/signin', request.url);
    signinUrl.searchParams.set('callbackUrl', pathname);
    return NextResponse.redirect(signinUrl);
  }

  // Role-based authorization for admin routes
  if (pathname.startsWith('/admin')) {
    if (!token) {
      return NextResponse.redirect(new URL('/signin', request.url));
    }

    if (token.role !== 'admin') {
      // Log unauthorized access attempt (dynamic import for edge runtime compatibility)
      // Note: In production, integrate with your logging service
      console.warn('Unauthorized admin access attempt:', {
        userId: token.sub,
        attemptedPath: pathname,
        userRole: token.role || 'none',
        ip: request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip'),
        timestamp: new Date().toISOString(),
      });

      // Return 403 Forbidden instead of redirecting to signin
      // This prevents revealing the existence of admin routes
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
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
