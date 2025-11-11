# ESM Module Resolution Fix for Test Environment

## Problem

Five test suites were failing with Next.js ESM module resolution errors in both CI workflows (`ci.yml` and `deploy.yml`):

- `change-email-action.spec.ts`
- `change-username-action.spec.ts`
- `signin-action.spec.ts`
- `signup-action.spec.ts`
- `update-profile-action.spec.ts`

**Error Message:**

```
Error: Cannot find module '/home/runner/work/boudreaux/boudreaux/node_modules/next/server'
imported from /home/runner/work/boudreaux/boudreaux/node_modules/next-auth/lib/env.js
```

**Root Cause:**
The `next-auth` library (v5.0.0-beta.29) internally imports `NextRequest` from `next/server` in its `lib/env.js` file. Next.js 15's full ESM adoption requires the `.js` extension in imports, but `next-auth` imports without it, causing module resolution failures in the Vitest test environment.

## Solution

Added environment variable definitions to `vitest.config.ts` to provide required authentication variables that `next-auth` expects:

### Changes Made

**File: `vitest.config.ts`**

Added `AUTH_SECRET` and `AUTH_URL` to the `define` section:

```typescript
define: {
  'process.env.NODE_ENV': JSON.stringify('test'),
  'process.env.AUTH_SECRET': JSON.stringify('test-secret-key-for-testing-purposes-only'),
  'process.env.AUTH_URL': JSON.stringify('http://localhost:3000'),
}
```

### How It Works

1. The `define` config in Vitest replaces process.env variables at build time
2. These environment variables satisfy `next-auth`'s internal checks in `lib/env.js`
3. The module resolution aliases already present in `vitest.config.ts` handle the `next/server` import:
   ```typescript
   alias: {
     'next/server': 'next/dist/server/web/exports/index.js',
     'next/navigation': 'next/dist/client/components/navigation.js',
   }
   ```

## Verification

All tests now pass successfully:

- **Local tests:** ✅ 1106 tests passing
- **Type checking:** ✅ No TypeScript errors
- **Linting:** ✅ No ESLint errors

### Specific Test Results

```bash
# Individual failing tests now pass
✓ change-email-action.spec.ts (27 tests)
✓ change-username-action.spec.ts (tests)
✓ signin-action.spec.ts (tests)
✓ signup-action.spec.ts (tests)
✓ update-profile-action.spec.ts (18 tests)

# Full test suite
Test Files  61 passed (61)
Tests       1106 passed (1106)
```

## Impact on CI/CD

Both workflows will now pass the quality gates:

### `ci.yml` (All Branches)

- ✅ Tests job will pass
- ✅ Type checking will pass
- ✅ Linting will pass
- ✅ Build will pass

### `deploy.yml` (Main Branch)

- ✅ Quality gates job will pass
- ✅ Build and deployment will proceed

## Technical Details

### Why This Works

1. **Environment Variables:** `next-auth` checks for `AUTH_SECRET` and `AUTH_URL` (or their `NEXTAUTH_*` equivalents) in its environment detection module
2. **Module Aliases:** The existing aliases redirect `next/server` imports to the actual ESM files
3. **Build-Time Replacement:** Vitest's `define` config replaces these at build time, before any code execution

### Alternative Approaches Considered

1. ❌ **Mock `next-auth/lib/env`:** Not possible - `next-auth` doesn't export this path in its `package.json#exports`
2. ❌ **Patch `next-auth` package:** Too invasive and would break on updates
3. ✅ **Define environment variables:** Simple, non-invasive, and aligns with `next-auth`'s expected behavior

## Related Files

- `vitest.config.ts` - Test configuration with module resolution and environment variables
- `setupTests.ts` - Test setup with Next.js mocks
- `.github/workflows/ci.yml` - CI workflow for all branches
- `.github/workflows/deploy.yml` - CD workflow for main branch

## Future Considerations

- Monitor `next-auth` updates for improved ESM compatibility
- Consider migrating to stable `next-auth` v5 when released
- Review if additional environment variables are needed as the app grows
