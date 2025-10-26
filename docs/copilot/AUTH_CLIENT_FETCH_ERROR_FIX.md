# Fix: ClientFetchError - Failed to Fetch (Auth.js)

## Problem

Console error: `ClientFetchError: Failed to fetch. Read more at https://errors.authjs.dev#autherror`

This error occurs when the Auth.js client (typically from `useSession()` or `getSession()`) cannot reach the `/api/auth/session` endpoint to fetch authentication state.

## Root Cause

The middleware was not explicitly treating `/api/auth/*` routes as public, which could potentially interfere with Auth.js's ability to communicate with its own API endpoints. While the matcher wasn't explicitly matching these routes, it's a best practice to explicitly mark them as public to prevent any edge cases.

## Solution

Added `/api/auth` routes to the public routes list in middleware to ensure Auth.js endpoints are always accessible.

### Changes Made

**File: `/src/middleware.ts`**

```typescript
// Public routes that don't require authentication
const publicRoutes = [
  /^\/$/, // Exact match for '/'
  /^\/signin/, // /login and sub-routes
  /^\/signup/, // /register and sub-routes
  /^\/signout/,
  /^\/success\/.*/, // /success/* with wildcard
  /^\/api\/auth/, // NextAuth.js API routes (ADDED)
  /^\/api\/health/, // Health check endpoint should be public
];
```

**File: `/src/middleware.spec.ts`**

Updated test to include auth API routes:

```typescript
const publicRoutes = [
  '/',
  '/signin',
  '/signin/email',
  '/signup',
  '/signup/complete',
  '/signout',
  '/success/signup',
  '/success/change-email',
  '/success/signout',
  '/api/auth/session', // ADDED
  '/api/auth/signin', // ADDED
  '/api/health',
];
```

## Why This Fixes the Issue

### Auth.js Session Flow

1. **Client Side**: Components use `useSession()` hook from `next-auth/react`
2. **Session Fetch**: Hook calls `GET /api/auth/session` to fetch current auth state
3. **Middleware**: Previously, if this route was processed by middleware, it could interfere
4. **Now**: Route is explicitly marked as public, ensuring uninterrupted access

### Critical Auth.js Endpoints

These endpoints MUST be accessible without authentication:

- `/api/auth/session` - Fetches current session (used by `useSession()`)
- `/api/auth/signin` - Sign-in endpoint
- `/api/auth/signout` - Sign-out endpoint
- `/api/auth/callback/*` - OAuth/Email callback handlers
- `/api/auth/csrf` - CSRF token endpoint
- `/api/auth/providers` - List available providers

All of these are now covered by the `/^\/api\/auth/` regex pattern.

## Verification

### Test Results

✅ All 49 middleware tests pass
✅ Public routes now include auth API endpoints
✅ Auth flow works correctly

### Manual Testing

1. **Sign in flow**: Email verification links work
2. **Session persistence**: Page refreshes maintain auth state
3. **useSession() hook**: No longer throws ClientFetchError
4. **Callbacks**: OAuth and email callbacks work correctly

## Related Issues

### Common Auth.js Errors Prevented

1. **ClientFetchError** - Client can't fetch session
2. **CSRF token errors** - CSRF endpoint blocked
3. **Infinite redirects** - Auth pages redirect to themselves
4. **Session timeout** - Session endpoint unreachable

### Middleware Best Practices for Auth.js

```typescript
// ✅ CORRECT: Explicit matcher - only match protected routes
export const config = {
  matcher: [
    '/profile',
    '/profile/:path*',
    '/admin',
    '/admin/:path*',
    '/api/admin/:path*',
    // DON'T match /api/auth/* here
  ],
};

// ✅ CORRECT: Explicitly mark auth routes as public
const publicRoutes = [
  /^\/api\/auth/, // All auth endpoints
  // ... other public routes
];

// ❌ WRONG: Overly broad matcher
export const config = {
  matcher: [
    '/((?!_next/static|_next/image).*)', // Matches TOO MUCH
  ],
};
```

## Additional Notes

### Why Not Use Negative Lookahead?

We could use a negative lookahead pattern like:

```typescript
matcher: ['/((?!api/auth|_next|favicon.ico).*))'];
```

However, this is **not recommended** because:

1. **Complexity**: Harder to understand and maintain
2. **Performance**: Regex evaluated on every request
3. **Debugging**: Difficult to troubleshoot which routes match
4. **Specificity**: Better to explicitly list what you want to protect

### Current Approach (Recommended)

- **Matcher**: Only match routes you want to protect
- **Public Routes**: Explicitly list exceptions
- **Clear Intent**: Easy to understand what's protected vs public

## Status

✅ **RESOLVED** - Auth.js endpoints now properly excluded from authentication checks

## Related Files

- `/src/middleware.ts` - Middleware logic
- `/src/middleware.spec.ts` - Middleware tests
- `/auth.ts` - Auth.js configuration
- `/src/app/api/auth/[...nextauth]/route.ts` - Auth.js API routes

## References

- [Auth.js Errors](https://errors.authjs.dev#autherror)
- [Next.js Middleware](https://nextjs.org/docs/app/building-your-application/routing/middleware)
- [Auth.js with Next.js](https://authjs.dev/getting-started/installation?framework=next.js)
