# Turnstile Server-Side Verification Implementation

## Overview

This document describes the implementation of server-side Cloudflare Turnstile verification for the signup/signin forms.

## Problem

The Turnstile widget was implemented on the client side but **no server-side verification was in place**. The `CLOUDFLARE_SECRET` environment variable was configured but never used, meaning the CAPTCHA could be bypassed.

## Solution

### 1. Server-Side Verification Utility

Created `/src/lib/utils/verify-turnstile.ts`:

```typescript
export async function verifyTurnstile(
  token: string,
  ip?: string
): Promise<TurnstileVerifyResult>;
```

This function:

- Calls Cloudflare's `siteverify` API endpoint
- Uses `CLOUDFLARE_SECRET` environment variable
- Returns success/failure with error messages

### 2. Token Flow

The Turnstile token now flows through the application:

1. **TurnstileWidget** (`turnstile-widget.tsx`)
   - Receives token from Cloudflare
   - Calls `onToken(token)` callback

2. **SignupSigninForm** (`signup-signin-form.tsx`)
   - Accepts `onTurnstileToken` prop
   - Passes through to TurnstileWidget

3. **SignupPage** (`signup/page.tsx`)
   - Stores token in state: `turnstileToken`
   - Appends token to FormData: `cf-turnstile-response`

4. **Server Actions** (`signin-action.ts`, `signup-action.ts`)
   - Extract token from FormData
   - Call `verifyTurnstile(token, ip)`
   - Return error if verification fails

## Environment Variables

### Required

- `CLOUDFLARE_SECRET`: Server-side secret key from Cloudflare dashboard

### Configured In

- `.env` - Local development
- `docker-compose.prod.yml` - Production Docker
- `.github/workflows/deploy.yml` - GitHub Actions

## GitHub Secrets Required

Ensure `CLOUDFLARE_SECRET` is set in GitHub repository secrets:

1. Go to Repository → Settings → Secrets and variables → Actions
2. Add `CLOUDFLARE_SECRET` with the value from Cloudflare dashboard

## Testing Keys

For testing, Cloudflare provides special keys:

| Site Key                   | Secret Key                            | Behavior              |
| -------------------------- | ------------------------------------- | --------------------- |
| `1x00000000000000000000AA` | `1x0000000000000000000000000000000AA` | Always passes         |
| `2x00000000000000000000AB` | `2x0000000000000000000000000000000AB` | Always blocks         |
| `3x00000000000000000000FF` | `3x0000000000000000000000000000000FF` | Interactive challenge |

## Verification Flow

```
User clicks Turnstile checkbox
         ↓
Cloudflare returns token to client
         ↓
Client stores token and adds to FormData
         ↓
Server action receives FormData
         ↓
Server calls Cloudflare siteverify API
         ↓
Cloudflare validates token with secret
         ↓
Server proceeds or returns error
```

## Files Modified

- `/src/lib/utils/verify-turnstile.ts` - **NEW** - Server verification utility
- `/src/app/components/ui/turnstile-widget.tsx` - Added `onToken` prop
- `/src/app/components/forms/signup-signin-form.tsx` - Added `onTurnstileToken` prop
- `/src/app/(auth)/signup/page.tsx` - Token state and FormData handling
- `/src/lib/actions/signup-action.ts` - Server-side verification
- `/src/lib/actions/signin-action.ts` - Server-side verification
