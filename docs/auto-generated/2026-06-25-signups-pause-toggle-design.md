<!-- This Source Code Form is subject to the terms of the Mozilla Public
   - License, v. 2.0. If a copy of the MPL was not distributed with this
   - file, You can obtain one at https://mozilla.org/MPL/2.0/. -->

# Design: admin-controllable "pause new signups"

Branch: `feature/upgrade-signin-signup-flows` (continues the better-auth work; the
env-flag change from the prior step is staged-but-uncommitted and folds in here).

## Context

The better-auth migration added an env kill switch, `AUTH_DISABLE_SIGNUP`, that pauses
new email signups — but it is read at startup, so flipping it needs a server restart.
Restarting under a live traffic spike is exactly the wrong move (drops in-flight
requests, risky cold start). The operator wants to pause/resume **new account creation
instantly** from the admin UI, keep the env var as a hard infra-level override, and show
users a "signups are paused" notice instead of a dead-end.

## Goals

- Admin can pause/resume **new account creation** instantly from the admin UI (no restart).
- `AUTH_DISABLE_SIGNUP` remains a **hard override** — when set, the env wins and the admin
  toggle cannot un-pause.
- A user-facing "signups are temporarily paused" notice on `/signup`.
- **Existing users can always sign in while paused** — only account _creation_ is blocked.

## Non-goals (YAGNI)

- Blocking existing-user sign-in.
- Scheduling, per-provider pausing, or a general multi-flag settings framework. (The new
  settings page may grow later, but this ships exactly one toggle.)

## Architecture

One predicate service is the single source of truth; it is consulted at every
account-creation path (which are disjoint), surfaced read-only to the signup UI, and
written by one admin action.

```
                         SignupSettingsService.areSignupsPaused()  = env OR db-toggle (cached)
                                   │
  ┌────────────────────────────────┼─────────────────────────────────────────────┐
  │ signup-action (email /signup)  │ user.create.before hook (/signin auto-create │  GET /api/auth/signup-status
  │  → friendly error, no create   │  + OAuth first sign-in) → return false (abort)│   → useSignupStatusQuery → form notice
  └────────────────────────────────┴──────────────────────────────────────────────┘
                                   ▲
              set-signups-paused-action (requireRole admin) → setSignupsPaused() → invalidate cache
```

## Components

### `SignupSettingsService` — `src/lib/services/signup-settings-service.ts` (`'server-only'`)

Single source of truth. Reuses the existing `SiteSettings` key-value store — **no new
Prisma model**.

- `areSignupsPaused(): Promise<boolean>` — returns `true` if `AUTH_DISABLE_SIGNUP === 'true'`
  (env wins); otherwise reads `SiteSettings` key `signups-paused` via
  `SiteSettingsRepository.findByKey`, **cached** with `withCache` +
  `getCacheTtlSeconds()` (0 in dev/E2E → instant toggle + avoids the Playwright
  probe-cache-poisoning gotcha; 300s in prod).
- `setSignupsPaused(paused: boolean): Promise<void>` — `SiteSettingsRepository.upsertByKey('signups-paused', String(paused))`
  then invalidate the cache key.
- `isEnvForced(): boolean` — `AUTH_DISABLE_SIGNUP === 'true'`; lets the admin UI disable the
  toggle and explain why.
- Constant: `SIGNUPS_PAUSED_SETTINGS_KEY = 'signups-paused'`.
- Depends on: `SiteSettingsRepository`, `simple-cache` (`withCache`, `cache`), the shared
  `getCacheTtlSeconds()` helper (reuse the banner/featured-artists one; extract if not
  already shared).

### Enforcement (two points, disjoint creation paths)

1. **`src/lib/actions/signup-action.ts`** — the email `/signup` form creates via
   `UserRepository.create` (bypasses better-auth's hook), so gate here: at the top, if
   `areSignupsPaused()` return `{ success: false, errors: { general: ['Signups are
temporarily paused. Please try again later.'] }, fields }` — create nothing, send no
   magic link.
2. **`src/lib/auth.ts` `databaseHooks.user.create.before`** — extend the existing hook:
   `if (await areSignupsPaused()) return false` (aborts creation per the verified
   better-auth contract in `db/with-hooks.mjs` — `false` → `null`), else the current
   `backfillUsername(user)`. This is the **only** path that catches **OAuth** first
   sign-in and `/signin` unknown-email auto-create.
3. **Env magic-link** keeps `magicLink({ disableSignUp: AUTH_DISABLE_SIGNUP })` (already
   built) so the env case still emits the clean `new_user_signup_disabled` at verify.

Existing users signing in never hit a create path, so they are unaffected.

### Admin UI — new `/admin/settings`

- `src/app/admin/settings/page.tsx` (server component) — reads `areSignupsPaused()` and
  `isEnvForced()`, renders the client toggle. Page is admin-gated by the existing
  `src/app/admin/layout.tsx` (`requireRole('admin')`).
- `src/app/admin/settings/signups-paused-toggle.tsx` (`'use client'`) — mirrors the
  chat-disable pattern (`admin/chat/chat-users-table.tsx`): shadcn `Switch`
  (`@/components/ui/switch`) + `useTransition` + `toast`. Calls `setSignupsPausedAction`;
  on success `toast` + invalidate the signup-status query. When `isEnvForced`, the Switch
  is `checked` + `disabled` with a note: "Forced on by `AUTH_DISABLE_SIGNUP` (env) — clear
  the env var to control this here."
- `src/lib/actions/set-signups-paused-action.ts` — `requireRole('admin')` → validate
  (Zod boolean) → `SignupSettingsService.setSignupsPaused` → `revalidatePath('/admin/settings')`;
  returns `{ success: true } | { success: false; error }` (mirrors `updateChatUserAction`).
- `src/app/admin/components/admin-nav-items.ts` — add a "Settings" nav item.

### User-facing notice on `/signup`

- `src/app/api/auth/signup-status/route.ts` — `GET` → `{ paused: await areSignupsPaused() }`
  (try/catch → 500 on failure; the form treats unknown as "not paused" to fail open).
- `src/app/hooks/use-signup-status-query.ts` — `useSignupStatusQuery` (TanStack Query;
  stable key from `src/lib/query-keys.ts`; forwards the `AbortSignal`; JSDoc per repo rule).
- `src/app/components/forms/signup-signin-form.tsx` — on the signup path only, consume the
  hook: render a notice card (shadcn `Alert`) above `SocialProviderButtons` and disable the
  submit when paused. The action's friendly error remains the fallback for a stale page
  submitted after a pause (already rendered by `FormStatusMessages`).

### Error copy (env magic-link path)

- `signin-action` / `signup-action` pass `errorCallbackURL` (→ `/signin`) so the env-path
  `?error=new_user_signup_disabled` redirect lands on a page we control.
- `src/lib/utils/auth/magic-link-error-messages.ts` — a minimal, extensible
  error-code→message map: `new_user_signup_disabled` → "Signups are temporarily paused."
  The `(auth)` signin/signup page reads the `?error=` search param and renders the mapped
  copy. Unmapped/generic codes (e.g. a real `failed_to_create_user`) are **not** relabeled.

  > **Known benign edge — DB-toggle path:** When signups are paused via the admin DB toggle
  > (not `AUTH_DISABLE_SIGNUP`), an unknown email requesting a `/signin` magic link reaches
  > better-auth's `createUser`; the `user.create.before` hook returns `false` to abort, and
  > better-auth redirects with the generic `failed_to_create_user` code — which is
  > intentionally left unmapped so that code produces the generic error page rather than the
  > friendly "Signups are temporarily paused." copy (that copy is reserved for the env path's
  > clean `new_user_signup_disabled` code). This divergence is accepted: requesting a sign-in
  > link for a non-existent account is an unusual flow, no account is created, and nothing is
  > leaked (the response is non-enumerating).

## Caching & E2E

- `getCacheTtlSeconds()` → 0 in dev/E2E, 300s in prod. TTL 0 keeps the admin toggle
  instant under test and sidesteps the documented webServer-probe cache-poisoning issue.
- `setSignupsPaused` invalidates the cache key so reads are immediately consistent in prod.

## Error handling

- Service/repo failures surface as `DataError` (existing `runQuery` wrapping); the API
  route and admin action `try/catch` and return appropriate states.
- The signup-status API route fails **open** (treat errors as "not paused") so a settings
  read blip never blocks the whole signup UI.
- The admin action returns `{ success: false, error }` on auth/validation/store failure;
  the toggle shows a `toast.error` and does not flip optimistically without confirmation.

## Testing

**Unit (Vitest):**

- `SignupSettingsService`: env override → paused; db read true/false; cache set/hit; `setSignupsPaused` upsert + invalidate; `isEnvForced`.
- `signup-action`: paused → friendly error, no `UserRepository.create`, no magic link; not-paused → unchanged.
- `auth.ts` hook: paused → returns `false`; not-paused → backfills username (extends the existing hook spec).
- `set-signups-paused-action`: non-admin → `unauthorized`; admin → calls service + revalidates + `{ success: true }`.
- `/api/auth/signup-status` route: returns `{ paused }`; error → fails open.
- `signups-paused-toggle`: renders Switch; env-forced → disabled + note; toggle calls action + toast.
- `signup-signin-form`: signup path + paused → notice shown + submit disabled; signin path → unaffected.
- `magic-link-error-messages`: maps the known code; passes through unknown.

**E2E (Playwright):**

- Admin pauses → `/signup` shows the notice + disabled submit; a forced submit is rejected with the friendly message.
- An existing user can still sign in while paused.
- Admin un-pauses → signup works again. (E2E TTL 0 → instant.)

Coverage held at the `COVERAGE_METRICS.md` baseline.

## Files

**New:** `signup-settings-service.ts` (+spec), `set-signups-paused-action.ts` (+spec),
`admin/settings/page.tsx`, `admin/settings/signups-paused-toggle.tsx` (+spec),
`api/auth/signup-status/route.ts` (+spec), `use-signup-status-query.ts` (+spec),
`magic-link-error-messages.ts` (+spec), this design doc.

**Modified:** `auth.ts` (hook + already-present env `disableSignUp`), `signup-action.ts`
(pause gate), `signup-signin-form.tsx` (notice + disabled submit), `admin-nav-items.ts`
(nav), `query-keys.ts` (signup-status key), `(auth)` signin/signup page (`?error=` reader),
plus the already-staged `.env.example` and `better-auth-production-secrets.md`.
