# Private Routes Redirect Fix

**Date:** October 22, 2025
**Issue:** Middleware not properly handling private routes - authenticated users couldn't access them
**Status:** ✅ Fixed

## Problem

The middleware was preventing **authenticated users** from accessing private routes (like `/profile`). When a user tried to visit `/profile` while authenticated, they were being redirected to the homepage (`/`) instead of being allowed through.

### Root Cause

The issue was caused by a default `callbackUrl` value that interfered with the redirect logic:

```typescript
// Before (broken)
const callbackUrl = request.nextUrl.searchParams.get('callbackUrl') || '/';
```

This caused several problems:

1. **Unwanted redirects for authenticated users**: When an authenticated user visited `/profile`:
   - `callbackUrl` defaulted to `'/'`
   - `pathname` was `/profile`
   - Middleware logic: `if (token && !isPublicRoute && callbackUrl && callbackUrl !== pathname)`
   - Result: Redirected to `'/'` instead of allowing access to `/profile`

2. **Unreachable code**: Lines 41-43 checked for public routes AFTER already returning early for public routes (dead code)

3. **Incorrect redirect logic**: The middleware was treating the absence of a `callbackUrl` parameter as if it was set to `'/'`

## Solution

### 1. Remove Default callbackUrl Value

Changed from defaulting to `'/'` to keeping it as `null` when not present:

```typescript
// After (fixed)
const callbackUrl = request.nextUrl.searchParams.get('callbackUrl');
```

**Why this works:**

- When no `callbackUrl` is in the URL params, it's `null`
- The redirect logic `if (token && callbackUrl && callbackUrl !== pathname)` only triggers when there's an **explicit** callbackUrl
- Authenticated users visiting `/profile` directly are allowed through

### 2. Remove Dead Code

Removed unreachable block that checked `isPublicRoute` after already returning for public routes:

```typescript
// REMOVED (dead code):
if (callbackUrl && isPublicRoute && !token) {
  return NextResponse.redirect(new URL(callbackUrl, request.url));
}
```

### 3. Simplify Redirect Logic

Simplified the authenticated redirect condition:

```typescript
// Before
if (token && !isPublicRoute && callbackUrl && callbackUrl !== pathname) {
  return NextResponse.redirect(new URL(callbackUrl, request.url));
}

// After
if (token && callbackUrl && callbackUrl !== pathname) {
  return NextResponse.redirect(new URL(callbackUrl, request.url));
}
```

**Why simpler is better:**

- We already returned for public routes, so `!isPublicRoute` is always true here
- Removing redundant check makes the logic clearer

## Middleware Flow (Fixed)

### Unauthenticated User Visits `/profile`

1. `isPrivateRoute` = true, `token` = null
2. **Line 30-34**: ✅ Redirects to `/signin?callbackUrl=/profile`

### Authenticated User Visits `/profile`

1. `isPrivateRoute` = true, `token` = { ... }
2. **Line 30-34**: Check fails (has token), continues
3. **Line 37-39**: `isPublicRoute` = false, continues
4. **Line 42-44**: `callbackUrl` = null (no redirect param), check fails
5. **Line 47-51**: Has token, continues
6. **Line 54-73**: Not an admin route, skips
7. **Line 75**: ✅ Returns `NextResponse.next()` - allows access!

### Authenticated User Clicks Email Link with callbackUrl

User clicks link: `/signin?callbackUrl=/profile`

1. After auth, middleware runs with `callbackUrl=/profile`, `pathname=/signin`
2. **Line 42-44**: Has token + callbackUrl + different pathname → redirects to `/profile` ✅

## Test Updates

Updated 4 failing tests that expected the buggy behavior:

### 1. Private Routes Test

```typescript
// Before (wrong expectation)
it('should allow authenticated users to access private routes', async () => {
  const result = await middleware(request);
  expect(result.type).toBe('redirect'); // ❌ Expected redirect
  expect(result.url).toBe('https://example.com/'); // ❌ To homepage
});

// After (correct behavior)
it('should allow authenticated users to access private routes', async () => {
  const result = await middleware(request);
  expect(result.type).toBe('next'); // ✅ Allow through
  expect(mockNextResponse.next).toHaveBeenCalled();
});
```

### 2. Non-Admin Access Test

```typescript
// Before
it('should redirect non-admin users...', async () => {
  expect(result.type).toBe('redirect'); // ❌ Wrong
});

// After
it('should reject non-admin users...with 403', async () => {
  expect(result.type).toBe('json'); // ✅ Returns 403 JSON
  expect(result.init?.status).toBe(403);
});
```

### 3 & 4. Admin Routes Tests

```typescript
// Before
it('should allow admin users to access admin routes', async () => {
  expect(result.type).toBe('redirect'); // ❌ Expected redirect to '/'
});

// After
it('should allow admin users to access admin routes', async () => {
  expect(result.type).toBe('next'); // ✅ Allow through
  expect(mockNextResponse.next).toHaveBeenCalled();
});
```

## Files Modified

### `/middleware.ts`

**Line 9**: Removed default value

```typescript
- const callbackUrl = request.nextUrl.searchParams.get('callbackUrl') || '/';
+ const callbackUrl = request.nextUrl.searchParams.get('callbackUrl');
```

**Lines 41-48**: Removed dead code and simplified logic

```typescript
- // Redirect to the callbackUrl if on a public route with a callbackUrl and no token
- if (callbackUrl && isPublicRoute && !token) {
-   return NextResponse.redirect(new URL(callbackUrl, request.url));
- }
-
- // Redirect to private callback url route if user is authenticated and the route isn't public
- if (token && !isPublicRoute && callbackUrl && callbackUrl !== pathname) {
+ // Redirect to private callback url route if user is authenticated and has an explicit callbackUrl
+ if (token && callbackUrl && callbackUrl !== pathname) {
    return NextResponse.redirect(new URL(callbackUrl, request.url));
  }
```

### `/middleware.spec.ts`

Updated 4 tests to expect correct behavior:

- Line 125-135: Private route access for authenticated users
- Line 188-197: Non-admin 403 response for admin routes
- Line 199-212: Admin users allowed through
- Line 214-227: Nested admin routes allowed

## Test Results

**Before:** 43 passing, 4 failing ❌
**After:** 47 passing, 0 failing ✅

All tests now verify correct middleware behavior:

- ✅ Public routes accessible to everyone
- ✅ Private routes redirect unauthenticated users to signin
- ✅ Private routes allow authenticated users through
- ✅ Admin routes redirect unauthenticated users to signin
- ✅ Admin routes return 403 for non-admin authenticated users
- ✅ Admin routes allow admin users through
- ✅ callbackUrl only redirects when explicitly set in URL params

## Behavior Matrix

| Route Type | Auth Status           | Has callbackUrl? | Result                                      |
| ---------- | --------------------- | ---------------- | ------------------------------------------- |
| Public     | Any                   | Any              | ✅ Allow through                            |
| Private    | No token              | N/A              | ➡️ Redirect to `/signin?callbackUrl=<path>` |
| Private    | Has token             | No               | ✅ Allow through                            |
| Private    | Has token             | Yes (different)  | ➡️ Redirect to callbackUrl                  |
| Private    | Has token             | Yes (same)       | ✅ Allow through                            |
| Admin      | No token              | N/A              | ➡️ Redirect to `/signin?callbackUrl=<path>` |
| Admin      | Has token (not admin) | Any              | 🚫 Return 403 JSON                          |
| Admin      | Has token (admin)     | No               | ✅ Allow through                            |
| Admin      | Has token (admin)     | Yes (different)  | ➡️ Redirect to callbackUrl                  |

## Edge Cases Handled

1. **Direct navigation**: `/profile` → Authenticated users go through ✅
2. **Email magic link**: `/signin?callbackUrl=/profile` → Redirects to `/profile` after auth ✅
3. **Callback matches pathname**: `/profile?callbackUrl=/profile` → No redirect loop ✅
4. **Admin without callbackUrl**: `/admin/dashboard` → Admin goes through ✅
5. **Non-admin to admin route**: `/admin/dashboard` → 403 Forbidden ✅

## Security Considerations

### Before (Vulnerable)

- Authenticated users couldn't access their own profile
- Admin routes had confusing redirect behavior
- Default callbackUrl could cause redirect loops

### After (Secure)

- ✅ Private routes properly protected from unauthenticated access
- ✅ Admin routes return 403 (doesn't reveal existence to non-admins)
- ✅ Explicit callbackUrl only - no assumptions
- ✅ No redirect loops from default values
- ✅ Security logging for unauthorized admin access attempts

## callbackUrl Use Cases

### When callbackUrl IS present:

1. **Email magic links**: User clicks email link with `?callbackUrl=/profile`
2. **Post-signin redirects**: After successful signin, redirect to intended destination
3. **OAuth flows**: Return user to original page after external auth

### When callbackUrl is NOT present:

1. **Direct navigation**: User types URL or clicks internal link
2. **Bookmarked pages**: User visits saved link
3. **Deep links**: App-to-app navigation

**Key insight**: Most navigation doesn't have a callbackUrl, so defaulting to `/` broke normal access patterns!

## Related Components

- `/middleware.ts` - Route protection and redirect logic
- `/auth.ts` - Session management and JWT callbacks
- `/src/app/(auth)/profile/page.tsx` - Private route example
- `/src/app/admin/*` - Admin route examples

## Verification Steps

1. ✅ Code fixed in middleware.ts
2. ✅ Tests updated (4 tests)
3. ✅ All 47 middleware tests passing
4. ✅ TypeScript compilation successful
5. ✅ ESLint passing
6. 🔲 Manual testing: Navigate to `/profile` while authenticated

## Manual Testing Checklist

- [ ] Visit `/` (home) - should load normally
- [ ] Visit `/profile` while logged out - should redirect to signin with callbackUrl
- [ ] Visit `/profile` while logged in - should allow access (not redirect to home)
- [ ] Visit `/admin` while logged in as user - should return 403
- [ ] Visit `/admin` while logged in as admin - should allow access
- [ ] Click email magic link with callbackUrl - should redirect after signin

---

## Summary

Fixed middleware to properly handle private routes by removing the default `callbackUrl` value that was causing unwanted redirects. Authenticated users can now access private routes like `/profile` without being redirected to the homepage. Admin routes continue to work correctly with proper 403 responses for non-admin users.

**Key Change**: `callbackUrl` is now `null` when not explicitly provided, allowing normal navigation patterns to work correctly.

**Result**: All routes work as intended - public routes are open, private routes require authentication, and admin routes require admin role.
