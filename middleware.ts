import { NextResponse } from 'next/server';
import { getToken } from 'next-auth/jwt';
import type { NextRequest } from 'next/server';

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  const callbackUrl = request.nextUrl.searchParams.get('callbackUrl') || '/';

  // Public routes that don't require authentication
  const publicRoutes = [
    /^\/$/, // Exact match for '/'
    /^\/signin/, // /login and sub-routes
    /^\/signup/, // /register and sub-routes
    /^\/signout/,
    /^\/success\/.*/, // /success/* with wildcard
  ];

  const token = await getToken({
    req: request,
    secret: process.env.NEXTAUTH_SECRET,
  });
  const isPublicRoute = publicRoutes.some((route) => route.test(pathname));

  // Return early for public routes
  if (isPublicRoute) {
    return NextResponse.next();
  }

  // Redirect to the callbackUrl if on a public route with a callbackUrl and no token
  if (callbackUrl && isPublicRoute && !token) {
    return NextResponse.redirect(new URL(callbackUrl, request.url));
  }

  // Redirect to private callback url route if user is authenticated and the route isn't public
  if (token && !isPublicRoute && callbackUrl && callbackUrl !== pathname) {
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
      return NextResponse.redirect(new URL('/signin', request.url));
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - api/auth (Auth.js routes)
     * - _next/static (static files)
     * - _next/image (image optimization)
     * - favicon.ico (favicon)
     * - public files (e.g., robots.txt, humans.txt)
     * Also, specifically match /admin and /api/admin routes for role-based access
     */
    '/admin/:path*',
    '/api/admin/:path*',
    '/((?!api/auth|_next/static|_next/image|favicon.ico|public).*)',
  ],
};
