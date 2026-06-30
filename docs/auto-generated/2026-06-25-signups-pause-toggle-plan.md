<!-- This Source Code Form is subject to the terms of the Mozilla Public
   - License, v. 2.0. If a copy of the MPL was not distributed with this
   - file, You can obtain one at https://mozilla.org/MPL/2.0/. -->

# Signups Pause Toggle Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let an admin pause/resume new account creation instantly from the admin UI (no restart), keep `AUTH_DISABLE_SIGNUP` as a hard env override, and show users a "signups paused" notice.

**Architecture:** One server-only predicate service (`SignupSettingsService`, env OR a cached `SiteSettings` row) is consulted at the two disjoint account-creation paths — the `/signup` server action (which creates via `UserRepository.create`) and better-auth's `user.create.before` hook (which catches `/signin` auto-create + OAuth) — surfaced read-only to the signup UI via an API route + query hook, and written by one admin action behind a new `/admin/settings` page.

**Tech Stack:** Next.js 16 App Router, React 19, better-auth, Prisma (MongoDB) via `SiteSettingsRepository`, TanStack Query 5, shadcn `Switch`/`Alert`, Vitest 4, Playwright.

**Spec:** `docs/auto-generated/2026-06-25-signups-pause-toggle-design.md`

## Global Constraints

Every task implicitly includes all of these.

- **TDD, always:** write the failing test, run it red, implement minimally, run it green, then commit.
- **Gate before every commit (all four):** `pnpm run typecheck && pnpm run test:run && pnpm run lint && pnpm run format`.
- **Branch:** `feature/upgrade-signin-signup-flows`. Never commit to `main`. No `Co-authored-by`/AI-attribution lines. Conventional Commits `type(scope): <gitmoji> subject`, subject ≤50 chars.
- **TS:** no `any`, no non-null `!`, no `eslint-disable`/`@ts-ignore`. Named exports only — except App Router `page`/`route` files (default export). Arrow functions only — except App Router special files.
- **Tests:** `describe`/`it`/`expect`/`vi` are globals (never import from `vitest`). Server-only specs: `vi.mock('server-only', () => ({}))`. One condition per test; no `expect` in a conditional. Mock external deps (Prisma/SES/Stripe) at the service boundary.
- **MPL header** (`HEADER.txt`) on every new source file. AI-generated markdown lives in `docs/auto-generated/`.
- **Behavioral invariants:** Pause blocks **new account creation only** — existing users always sign in. **Env wins:** `process.env.AUTH_DISABLE_SIGNUP === 'true'` forces paused and the admin toggle cannot un-pause. `SiteSettings` key is the literal `'signups-paused'`, value `'true'`/`'false'`. Cache TTL `getCacheTtlSeconds()` = `0` in dev/E2E else `300`; invalidate on write. UI/API **fail open** (treat read errors as "not paused") — the hook + action are the hard server-side enforcement.
- **Reuse (do not reinvent):** `SiteSettingsRepository` (`findByKey`/`upsertByKey`), `cache`/`withCache` (`@/lib/utils/simple-cache`), `Switch` (`@/components/ui/switch`), `requireRole` (`@/lib/utils/auth/require-role`), the chat-disable toggle pattern (`src/app/admin/chat/chat-users-table.tsx` + `src/lib/actions/update-chat-user-action.ts`).
- **User-facing copy (verbatim):** action/notice → `"Signups are temporarily paused. Please try again later."`; error-code map → `"Signups are temporarily paused."`

---

## File Structure

**New:**

- `src/lib/services/signup-settings-service.ts` (+ `.spec.ts`) — predicate + setter.
- `src/lib/auth/user-create-before-hook.ts` (+ `.spec.ts`) — composes pause-gate + username backfill.
- `src/lib/actions/set-signups-paused-action.ts` (+ `.spec.ts`) — admin write action.
- `src/lib/validation/signups-paused-schema.ts` — Zod boolean schema.
- `src/app/api/auth/signup-status/route.ts` (+ `.spec.ts`) — GET `{ paused }`.
- `src/app/hooks/use-signup-status-query.ts` (+ `.spec.ts`) — TanStack hook.
- `src/app/admin/settings/page.tsx` — server page.
- `src/app/admin/settings/signups-paused-toggle.tsx` (+ `.spec.tsx`) — client toggle.
- `src/lib/utils/auth/magic-link-error-messages.ts` (+ `.spec.ts`) — error-code→copy map.
- `e2e/tests/auth/signups-pause.spec.ts` — E2E flow.

**Modified:**

- `src/lib/auth.ts` — wire `user.create.before` to the new hook (keep the already-present env `disableSignUp`).
- `src/lib/auth.spec.ts` — mock `SignupSettingsService` so the existing backfill test still resolves.
- `src/lib/actions/signup-action.ts` (+ `.spec.ts`) — pause gate before create.
- `src/lib/actions/signin-action.ts` + `src/lib/actions/signup-action.ts` — pass `errorCallbackURL`.
- `src/app/components/forms/signup-signin-form.tsx` (+ `.spec.tsx`) — notice + disabled submit.
- `src/app/(auth)/signup/page.tsx` (or the shared `(auth)` page) — read `?error=` and render mapped copy.
- `src/app/admin/components/admin-nav-items.ts` — add "Settings".
- `src/lib/query-keys.ts` — add `signupStatus` factory.

**Already staged (Task 0 commits these):** `src/lib/auth.ts` (env `disableSignUp`), `src/lib/auth.spec.ts` (env tests), `.env.example`, `docs/auto-generated/better-auth-production-secrets.md`, plus the two design/plan docs.

---

## Task 0: Commit the foundation

**Files:** the already-staged env-flag change + the design & plan docs.

- [ ] **Step 1 — confirm gate is green** (the env-flag change already passed; re-confirm): `pnpm run typecheck && pnpm run test:run && pnpm run lint && pnpm run format`. Expected: all pass.
- [ ] **Step 2 — commit the env flag** (4 files):

```bash
git add .env.example docs/auto-generated/better-auth-production-secrets.md src/lib/auth.spec.ts src/lib/auth.ts
git commit -m "feat(auth): ✨ env-driven signup kill switch"
```

- [ ] **Step 3 — commit the design + plan docs:**

```bash
git add docs/auto-generated/2026-06-25-signups-pause-toggle-design.md docs/auto-generated/2026-06-25-signups-pause-toggle-plan.md
git commit -m "docs(auth): 📝 signups-pause toggle design + plan"
```

---

## Task 1: `SignupSettingsService` (predicate + setter)

**Files:**

- Create: `src/lib/services/signup-settings-service.ts`
- Test: `src/lib/services/signup-settings-service.spec.ts`

**Interfaces:**

- Consumes: `SiteSettingsRepository.findByKey(key): Promise<SiteSettings | null>`, `SiteSettingsRepository.upsertByKey(key, value): Promise<SiteSettings>`, `withCache(key, fn, ttl)`, `cache.delete(key)` from `@/lib/utils/simple-cache`.
- Produces:
  - `SIGNUPS_PAUSED_SETTINGS_KEY = 'signups-paused'`
  - `SignupSettingsService.areSignupsPaused(): Promise<boolean>`
  - `SignupSettingsService.setSignupsPaused(paused: boolean): Promise<void>`
  - `SignupSettingsService.isEnvForced(): boolean`

- [ ] **Step 1 — failing test.** `src/lib/services/signup-settings-service.spec.ts` (server-only spec):

```ts
vi.mock('server-only', () => ({}));
vi.mock('@/lib/repositories/site-settings-repository', () => ({
  SiteSettingsRepository: { findByKey: vi.fn(), upsertByKey: vi.fn() },
}));
vi.mock('@/lib/utils/simple-cache', () => ({
  // pass-through cache so we observe repository calls directly
  withCache: vi.fn((_key: string, fn: () => unknown) => fn()),
  cache: { delete: vi.fn() },
}));

import { SiteSettingsRepository } from '@/lib/repositories/site-settings-repository';
import { cache } from '@/lib/utils/simple-cache';
import { SIGNUPS_PAUSED_SETTINGS_KEY, SignupSettingsService } from './signup-settings-service';

const mockFindByKey = vi.mocked(SiteSettingsRepository.findByKey);
const mockUpsert = vi.mocked(SiteSettingsRepository.upsertByKey);

afterEach(() => vi.unstubAllEnvs());

describe('SignupSettingsService.areSignupsPaused', () => {
  it('returns true when AUTH_DISABLE_SIGNUP is "true" (env wins)', async () => {
    vi.stubEnv('AUTH_DISABLE_SIGNUP', 'true');
    expect(await SignupSettingsService.areSignupsPaused()).toBe(true);
  });

  it('does not hit the database when env forces pause', async () => {
    vi.stubEnv('AUTH_DISABLE_SIGNUP', 'true');
    await SignupSettingsService.areSignupsPaused();
    expect(mockFindByKey).not.toHaveBeenCalled();
  });

  it('returns true when the stored setting is "true"', async () => {
    vi.stubEnv('AUTH_DISABLE_SIGNUP', '');
    mockFindByKey.mockResolvedValue({
      id: '1',
      key: SIGNUPS_PAUSED_SETTINGS_KEY,
      value: 'true',
      updatedAt: new Date(),
    });
    expect(await SignupSettingsService.areSignupsPaused()).toBe(true);
  });

  it('returns false when the setting is absent', async () => {
    vi.stubEnv('AUTH_DISABLE_SIGNUP', '');
    mockFindByKey.mockResolvedValue(null);
    expect(await SignupSettingsService.areSignupsPaused()).toBe(false);
  });
});

describe('SignupSettingsService.setSignupsPaused', () => {
  it('upserts the stringified flag', async () => {
    await SignupSettingsService.setSignupsPaused(true);
    expect(mockUpsert).toHaveBeenCalledWith(SIGNUPS_PAUSED_SETTINGS_KEY, 'true');
  });

  it('invalidates the cache after writing', async () => {
    await SignupSettingsService.setSignupsPaused(false);
    expect(cache.delete).toHaveBeenCalled();
  });
});

describe('SignupSettingsService.isEnvForced', () => {
  it('reflects the env var', () => {
    vi.stubEnv('AUTH_DISABLE_SIGNUP', 'true');
    expect(SignupSettingsService.isEnvForced()).toBe(true);
  });
});
```

- [ ] **Step 2 — run red:** `pnpm exec vitest run src/lib/services/signup-settings-service.spec.ts` → FAIL (module not found).
- [ ] **Step 3 — implement** `src/lib/services/signup-settings-service.ts` (MPL header + `'server-only'`):

```ts
import 'server-only';

import { SiteSettingsRepository } from '@/lib/repositories/site-settings-repository';
import { cache, withCache } from '@/lib/utils/simple-cache';

export const SIGNUPS_PAUSED_SETTINGS_KEY = 'signups-paused';
const CACHE_KEY = `site-setting:${SIGNUPS_PAUSED_SETTINGS_KEY}`;

// Mirror the banner/featured-artists pattern: no cache in dev/E2E so the admin
// toggle is instant under test and the Playwright probe can't poison it.
const getCacheTtlSeconds = (): number =>
  process.env.NODE_ENV === 'development' || process.env.E2E_MODE === 'true' ? 0 : 300;

const isEnvForced = (): boolean => process.env.AUTH_DISABLE_SIGNUP === 'true';

const readDbPaused = async (): Promise<boolean> =>
  withCache(
    CACHE_KEY,
    async () =>
      (await SiteSettingsRepository.findByKey(SIGNUPS_PAUSED_SETTINGS_KEY))?.value === 'true',
    getCacheTtlSeconds()
  );

export const SignupSettingsService = {
  isEnvForced,
  areSignupsPaused: async (): Promise<boolean> => (isEnvForced() ? true : readDbPaused()),
  setSignupsPaused: async (paused: boolean): Promise<void> => {
    await SiteSettingsRepository.upsertByKey(SIGNUPS_PAUSED_SETTINGS_KEY, String(paused));
    cache.delete(CACHE_KEY);
  },
};
```

- [ ] **Step 4 — run green:** same command → PASS.
- [ ] **Step 5 — gate + commit:**

```bash
git add src/lib/services/signup-settings-service.ts src/lib/services/signup-settings-service.spec.ts
git commit -m "feat(auth): ✨ signup-settings predicate service"
```

---

## Task 2: Gate better-auth user creation when paused

Catches `/signin` unknown-email auto-create and **OAuth** first sign-in. Extract the create-before logic into its own unit so it is testable in isolation, then wire `auth.ts` to it.

**Files:**

- Create: `src/lib/auth/user-create-before-hook.ts`, `src/lib/auth/user-create-before-hook.spec.ts`
- Modify: `src/lib/auth.ts` (the `databaseHooks.user.create.before` wiring), `src/lib/auth.spec.ts` (add a `SignupSettingsService` mock)

**Interfaces:**

- Consumes: `SignupSettingsService.areSignupsPaused()`, `backfillUsername` (`@/lib/auth/backfill-username-hook`).
- Produces: `userCreateBeforeHook(user): Promise<false | { data: ... }>` — returns `false` to abort creation when paused (better-auth `db/with-hooks.mjs` treats `false` → `null` = aborted), else delegates to `backfillUsername`.

- [ ] **Step 1 — failing test** `src/lib/auth/user-create-before-hook.spec.ts`:

```ts
import { userCreateBeforeHook } from './user-create-before-hook';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/services/signup-settings-service', () => ({
  SignupSettingsService: { areSignupsPaused: vi.fn() },
}));
vi.mock('@/lib/auth/backfill-username-hook', () => ({
  backfillUsername: vi.fn((user) => ({ data: { ...user, username: 'placeholder1234' } })),
}));

import { SignupSettingsService } from '@/lib/services/signup-settings-service';
const mockPaused = vi.mocked(SignupSettingsService.areSignupsPaused);

describe('userCreateBeforeHook', () => {
  it('returns false (aborts) when signups are paused', async () => {
    mockPaused.mockResolvedValue(true);
    expect(await userCreateBeforeHook({ email: 'a@b.com' })).toBe(false);
  });

  it('backfills a username when not paused', async () => {
    mockPaused.mockResolvedValue(false);
    const result = await userCreateBeforeHook({ email: 'a@b.com' });
    expect(result).toEqual({ data: { email: 'a@b.com', username: 'placeholder1234' } });
  });
});
```

- [ ] **Step 2 — run red:** `pnpm exec vitest run src/lib/auth/user-create-before-hook.spec.ts` → FAIL.
- [ ] **Step 3 — implement** `src/lib/auth/user-create-before-hook.ts` (MPL header + `'server-only'`):

```ts
import 'server-only';

import { backfillUsername, type UsernameBackfillInput } from '@/lib/auth/backfill-username-hook';
import { SignupSettingsService } from '@/lib/services/signup-settings-service';

/**
 * better-auth `user.create.before` hook. Aborts creation (returns `false`) when
 * signups are paused — the only enforcement point for OAuth first sign-in and
 * `/signin` unknown-email auto-create. Otherwise backfills a unique username.
 */
export const userCreateBeforeHook = async <InputType extends UsernameBackfillInput>(
  user: InputType
): Promise<false | ReturnType<typeof backfillUsername<InputType>>> =>
  (await SignupSettingsService.areSignupsPaused()) ? false : backfillUsername(user);
```

(If `UsernameBackfillInput` is not exported from `backfill-username-hook.ts`, export it there in this step.)

- [ ] **Step 4 — wire `auth.ts`.** Replace the hook body at `src/lib/auth.ts` (`databaseHooks.user.create.before`):

```ts
import { userCreateBeforeHook } from '@/lib/auth/user-create-before-hook';
// ...
      create: {
        before: async (user) => userCreateBeforeHook(user),
      },
```

- [ ] **Step 5 — keep `auth.spec.ts` green.** Add a mock so the existing "backfills a placeholder username" test still resolves (areSignupsPaused → false):

```ts
vi.mock('@/lib/services/signup-settings-service', () => ({
  SignupSettingsService: {
    areSignupsPaused: vi.fn().mockResolvedValue(false),
    isEnvForced: vi.fn(() => false),
  },
}));
```

- [ ] **Step 6 — run green:** `pnpm exec vitest run src/lib/auth/user-create-before-hook.spec.ts src/lib/auth.spec.ts` → PASS.
- [ ] **Step 7 — gate + commit:**

```bash
git add src/lib/auth/user-create-before-hook.ts src/lib/auth/user-create-before-hook.spec.ts src/lib/auth.ts src/lib/auth.spec.ts
git commit -m "feat(auth): ✨ gate user creation when paused"
```

---

## Task 3: Block `/signup` when paused

The `/signup` form creates via `UserRepository.create` (not better-auth), so it needs its own gate that returns the friendly message and creates nothing.

**Files:**

- Modify: `src/lib/actions/signup-action.ts`, `src/lib/actions/signup-action.spec.ts`

**Interfaces:**

- Consumes: `SignupSettingsService.areSignupsPaused()`.

- [ ] **Step 1 — failing test** (add to `signup-action.spec.ts`; mock `SignupSettingsService`). Assert that when paused, the friendly error is returned and `UserRepository.create` is **not** called:

```ts
// with SignupSettingsService.areSignupsPaused mocked to resolve true:
it('returns the paused message and creates no user when signups are paused', async () => {
  mockAreSignupsPaused.mockResolvedValue(true);
  const result = await signupAction(initialState, validSignupFormData());
  expect(result.errors?.general?.[0]).toBe(
    'Signups are temporarily paused. Please try again later.'
  );
});

it('does not create a user when signups are paused', async () => {
  mockAreSignupsPaused.mockResolvedValue(true);
  await signupAction(initialState, validSignupFormData());
  expect(mockUserRepositoryCreate).not.toHaveBeenCalled();
});
```

- [ ] **Step 2 — run red:** `pnpm exec vitest run src/lib/actions/signup-action.spec.ts` → FAIL.
- [ ] **Step 3 — implement.** In `signup-action.ts`, inside `if (parsed.success)` after the disposable-email check and **before** `UserRepository.create`, add:

```ts
if (await SignupSettingsService.areSignupsPaused()) {
  return {
    success: false,
    errors: { general: ['Signups are temporarily paused. Please try again later.'] },
    fields: formState.fields,
  };
}
```

- [ ] **Step 4 — run green** → PASS.
- [ ] **Step 5 — gate + commit:**

```bash
git add src/lib/actions/signup-action.ts src/lib/actions/signup-action.spec.ts
git commit -m "feat(auth): ✨ block /signup when paused"
```

---

## Task 4: signup-status API route + query hook

**Files:**

- Create: `src/app/api/auth/signup-status/route.ts` (+ `.spec.ts`), `src/app/hooks/use-signup-status-query.ts` (+ `.spec.ts`)
- Modify: `src/lib/query-keys.ts`

**Interfaces:**

- Produces: `GET /api/auth/signup-status` → `{ paused: boolean }`; `useSignupStatusQuery(options?)` returning `{ data: { paused } | undefined, ... }`; `queryKeys.signupStatus.status()`.

- [ ] **Step 1 — add the query key** to `src/lib/query-keys.ts` (mirror `health`):

```ts
  signupStatus: {
    all: ['signupStatus'] as const,
    status: () => [...queryKeys.signupStatus.all, 'status'] as const,
  },
```

- [ ] **Step 2 — failing route test** `src/app/api/auth/signup-status/route.spec.ts` (mock `SignupSettingsService`, `vi.mock('server-only', () => ({}))`):

```ts
it('returns the paused flag', async () => {
  mockAreSignupsPaused.mockResolvedValue(true);
  const res = await GET();
  expect(await res.json()).toEqual({ paused: true });
});

it('fails open with paused:false on error', async () => {
  mockAreSignupsPaused.mockRejectedValue(new Error('db down'));
  const res = await GET();
  expect(await res.json()).toEqual({ paused: false });
});
```

- [ ] **Step 3 — run red** → FAIL.
- [ ] **Step 4 — implement route** `src/app/api/auth/signup-status/route.ts` (default export not required — use a named `GET`; MPL header):

```ts
import { NextResponse } from 'next/server';

import { SignupSettingsService } from '@/lib/services/signup-settings-service';

export const GET = async (): Promise<NextResponse> => {
  try {
    return NextResponse.json({ paused: await SignupSettingsService.areSignupsPaused() });
  } catch {
    return NextResponse.json({ paused: false });
  }
};
```

- [ ] **Step 5 — run green** → PASS.
- [ ] **Step 6 — failing hook test** `src/app/hooks/use-signup-status-query.spec.ts` — mirror an existing hook spec (e.g. `use-health-status-query` if present, else `useCdnStatus`); assert it fetches `/api/auth/signup-status` and returns `{ paused }`.
- [ ] **Step 7 — implement hook** `src/app/hooks/use-signup-status-query.ts` — mirror an existing `useEntityQuery` (signal-forwarding `fetch`, `queryKeys.signupStatus.status()`, trailing `QueryOptionsOverride`, JSDoc). The signup form passes `{ enabled: isSignupPath }`.
- [ ] **Step 8 — run green** → PASS.
- [ ] **Step 9 — gate + commit:**

```bash
git add src/lib/query-keys.ts src/app/api/auth/signup-status/ src/app/hooks/use-signup-status-query.ts src/app/hooks/use-signup-status-query.spec.ts
git commit -m "feat(auth): ✨ signup-status API + query hook"
```

---

## Task 5: "signups paused" notice + disabled submit

**Files:**

- Modify: `src/app/components/forms/signup-signin-form.tsx`, `src/app/components/forms/signup-signin-form.spec.tsx`

**Interfaces:**

- Consumes: `useSignupStatusQuery({ enabled })`; existing `hasTermsAndConditions` prop already signals the signup path.

- [ ] **Step 1 — failing test** (add to the form spec; mock `useSignupStatusQuery`):

```ts
it('shows the paused notice and disables submit on the signup path when paused', () => {
  mockUseSignupStatusQuery.mockReturnValue({ data: { paused: true } });
  render(<SignupSigninForm {...signupProps()} />);
  expect(screen.getByText(/signups are temporarily paused/i)).toBeInTheDocument();
});

it('does not show the notice on the signin path', () => {
  mockUseSignupStatusQuery.mockReturnValue({ data: { paused: true } });
  render(<SignupSigninForm {...signinProps()} />);
  expect(screen.queryByText(/signups are temporarily paused/i)).not.toBeInTheDocument();
});
```

- [ ] **Step 2 — run red** → FAIL.
- [ ] **Step 3 — implement.** Always call the hook (rules-of-hooks) gated by `enabled`; render a shadcn `Alert` above `SocialProviderButtons` and disable the submit when paused:

```tsx
const { data: signupStatus } = useSignupStatusQuery({ enabled: hasTermsAndConditions });
const signupsPaused = hasTermsAndConditions && signupStatus?.paused === true;
// ...above SocialProviderButtons:
{
  signupsPaused && (
    <Alert className="mb-4">
      <AlertDescription>Signups are temporarily paused. Please try again later.</AlertDescription>
    </Alert>
  );
}
// submit button: disabled={isPending || signupsPaused}
```

- [ ] **Step 4 — run green** → PASS.
- [ ] **Step 5 — gate + commit:**

```bash
git add src/app/components/forms/signup-signin-form.tsx src/app/components/forms/signup-signin-form.spec.tsx
git commit -m "feat(auth): ✨ signups-paused notice on signup"
```

---

## Task 6: Admin write action `setSignupsPausedAction`

**Files:**

- Create: `src/lib/actions/set-signups-paused-action.ts` (+ `.spec.ts`), `src/lib/validation/signups-paused-schema.ts`

**Interfaces:**

- Consumes: `requireRole('admin')`, `SignupSettingsService.setSignupsPaused`, `revalidatePath`.
- Produces: `setSignupsPausedAction(input: { paused: boolean }): Promise<{ success: true } | { success: false; error: 'unauthorized' | 'invalid' }>`.

- [ ] **Step 1 — failing test** (mirror `update-chat-user-action.spec.ts`; mock `require-role`, `SignupSettingsService`, `next/cache`):

```ts
it('rejects non-admins', async () => {
  mockRequireRole.mockRejectedValue(new Error('Unauthorized'));
  expect(await setSignupsPausedAction({ paused: true })).toEqual({
    success: false,
    error: 'unauthorized',
  });
});

it('pauses signups for an admin', async () => {
  mockRequireRole.mockResolvedValue({ user: { id: 'a', role: 'admin' } });
  const result = await setSignupsPausedAction({ paused: true });
  expect(mockSetSignupsPaused).toHaveBeenCalledWith(true);
  expect(result).toEqual({ success: true });
});
```

- [ ] **Step 2 — run red** → FAIL.
- [ ] **Step 3 — implement** the Zod schema (`z.object({ paused: z.boolean() })`) and the action (`'use server'` + `'server-only'`, MPL header), mirroring `update-chat-user-action.ts`: `requireRole('admin')` in a try/catch → `safeParse` → `SignupSettingsService.setSignupsPaused(parsed.data.paused)` → `revalidatePath('/admin/settings')` → `{ success: true }`.
- [ ] **Step 4 — run green** → PASS.
- [ ] **Step 5 — gate + commit:**

```bash
git add src/lib/actions/set-signups-paused-action.ts src/lib/actions/set-signups-paused-action.spec.ts src/lib/validation/signups-paused-schema.ts
git commit -m "feat(admin): ✨ set-signups-paused action"
```

---

## Task 7: Admin `/admin/settings` page + toggle + nav

**Files:**

- Create: `src/app/admin/settings/page.tsx`, `src/app/admin/settings/signups-paused-toggle.tsx` (+ `.spec.tsx`)
- Modify: `src/app/admin/components/admin-nav-items.ts`

**Interfaces:**

- Consumes: `SignupSettingsService.areSignupsPaused()` + `isEnvForced()` (server), `setSignupsPausedAction` (client), `Switch`, `useSignupStatusQuery` invalidation.

- [ ] **Step 1 — failing toggle test** `signups-paused-toggle.spec.tsx` (mock `setSignupsPausedAction`, `sonner`):

```tsx
it('renders the switch reflecting the paused state', () => {
  render(<SignupsPausedToggle paused={true} envForced={false} />);
  expect(screen.getByRole('switch')).toBeChecked();
});

it('disables the switch and shows a note when env-forced', () => {
  render(<SignupsPausedToggle paused={true} envForced={true} />);
  expect(screen.getByRole('switch')).toBeDisabled();
  expect(screen.getByText(/AUTH_DISABLE_SIGNUP/)).toBeInTheDocument();
});

it('calls the action when toggled', async () => {
  mockAction.mockResolvedValue({ success: true });
  render(<SignupsPausedToggle paused={false} envForced={false} />);
  await userEvent.click(screen.getByRole('switch'));
  expect(mockAction).toHaveBeenCalledWith({ paused: true });
});
```

- [ ] **Step 2 — run red** → FAIL.
- [ ] **Step 3 — implement** `signups-paused-toggle.tsx` (`'use client'`, MPL header), mirroring `chat-users-table.tsx`'s `Switch` + `useTransition` + `toast`. Props `{ paused: boolean; envForced: boolean }`. When `envForced`: `<Switch checked disabled />` + a note containing `AUTH_DISABLE_SIGNUP`. Else `onCheckedChange` → `startTransition(async () => { const r = await setSignupsPausedAction({ paused: checked }); r.success ? toast.success(...) : toast.error(...); })`.
- [ ] **Step 4 — run green** → PASS.
- [ ] **Step 5 — implement the page** `src/app/admin/settings/page.tsx` (default export — App Router page; MPL header):

```tsx
import { SignupSettingsService } from '@/lib/services/signup-settings-service';
import { SignupsPausedToggle } from './signups-paused-toggle';

const AdminSettingsPage = async (): Promise<React.JSX.Element> => {
  const [paused, envForced] = [await SignupSettingsService.areSignupsPaused(), SignupSettingsService.isEnvForced()];
  return (/* heading + <SignupsPausedToggle paused={paused} envForced={envForced} /> */);
};

export default AdminSettingsPage;
```

- [ ] **Step 6 — add the nav item** to `admin-nav-items.ts` (a "Settings" entry → `/admin/settings`, a `lucide-react` icon e.g. `Settings`).
- [ ] **Step 7 — gate + commit:**

```bash
git add src/app/admin/settings/ src/app/admin/components/admin-nav-items.ts
git commit -m "feat(admin): ✨ signups-paused settings toggle"
```

---

## Task 8: Friendly error copy for the env magic-link path

**Files:**

- Create: `src/lib/utils/auth/magic-link-error-messages.ts` (+ `.spec.ts`)
- Modify: `src/lib/actions/signin-action.ts` + `src/lib/actions/signup-action.ts` (pass `errorCallbackURL`), the `(auth)` signin/signup page (read `?error=`)

**Interfaces:**

- Produces: `magicLinkErrorMessage(code: string | null | undefined): string | null` — maps `'new_user_signup_disabled'` → `'Signups are temporarily paused.'`, else `null`.

- [ ] **Step 1 — failing test** `magic-link-error-messages.spec.ts`:

```ts
it('maps the signup-disabled code', () => {
  expect(magicLinkErrorMessage('new_user_signup_disabled')).toBe('Signups are temporarily paused.');
});
it('returns null for unknown codes', () => {
  expect(magicLinkErrorMessage('failed_to_create_user')).toBeNull();
});
it('returns null for nullish input', () => {
  expect(magicLinkErrorMessage(undefined)).toBeNull();
});
```

- [ ] **Step 2 — run red** → FAIL.
- [ ] **Step 3 — implement** the map (`as const` record + lookup returning `null` for misses; MPL header).
- [ ] **Step 4 — run green** → PASS.
- [ ] **Step 5 — wire `errorCallbackURL`.** In both actions' `auth.api.signInMagicLink({ body })` calls, add `errorCallbackURL: '/signin'` so the env-path `?error=new_user_signup_disabled` lands on `/signin`. Update each action's spec to assert the body includes `errorCallbackURL: '/signin'`.
- [ ] **Step 6 — render the error.** In the `(auth)` signin/signup page, read the `error` search param, pass `magicLinkErrorMessage(error)` into the form's general-error slot (or an `Alert`). Add a page/form test that `?error=new_user_signup_disabled` renders "Signups are temporarily paused."
- [ ] **Step 7 — run green** (the touched specs) → PASS.
- [ ] **Step 8 — gate + commit:**

```bash
git add src/lib/utils/auth/magic-link-error-messages.ts src/lib/utils/auth/magic-link-error-messages.spec.ts src/lib/actions/signin-action.ts src/lib/actions/signup-action.ts 'src/app/(auth)'
git commit -m "feat(auth): ✨ friendly signups-disabled error copy"
```

---

## Task 9: E2E flow

**Files:**

- Create: `e2e/tests/auth/signups-pause.spec.ts`

**Interfaces:** uses the existing admin fixture/page objects and the seeded admin user; relies on E2E TTL 0 for instant toggling.

- [ ] **Step 1 — write the E2E spec** covering: (a) admin opens `/admin/settings`, toggles pause ON; (b) an anonymous visitor at `/signup` sees the notice + disabled submit, and a forced submit returns the friendly message; (c) an existing seeded user still signs in while paused; (d) admin toggles pause OFF and signup works again. Use existing helpers/fixtures (`e2e/helpers`, `e2e/fixtures`); keep it parallel-safe and deterministic.
- [ ] **Step 2 — run it** against the isolated Docker Mongo:

```bash
pnpm run e2e:docker:up
pnpm run test:e2e -- e2e/tests/auth/signups-pause.spec.ts
```

Expected: PASS. (Honor E2E DB isolation — `localhost:27018` only; never read `.env*` for the URL.)

- [ ] **Step 3 — commit:**

```bash
git add e2e/tests/auth/signups-pause.spec.ts
git commit -m "test(auth): ✅ e2e signups pause toggle flow"
```

---

## Final verification

- [ ] Full gate: `pnpm run typecheck && pnpm run test:run && pnpm run lint && pnpm run format` — all green.
- [ ] Coverage held: `pnpm run test:coverage:check` — no regression vs `COVERAGE_METRICS.md`.
- [ ] Manual smoke (optional): `AUTH_DISABLE_SIGNUP=` unset, `pnpm run dev`; toggle pause in `/admin/settings`; confirm `/signup` notice + disabled submit; confirm an existing user can still sign in; unpause; confirm signup works.
- [ ] Then: superpowers:finishing-a-development-branch.

## Self-review notes (spec coverage)

- Predicate (env OR db, cached, env-wins) → Task 1. Enforcement: `/signup` → Task 3; `/signin` auto-create + OAuth → Task 2; env clean error → existing `disableSignUp` (Task 0). Admin toggle (instant) → Tasks 6–7. User notice → Tasks 4–5. Error copy → Task 8. Existing-user sign-in unaffected (no create path touched) → covered by Task 2's scope + Task 9(c). Caching/E2E TTL 0 → Task 1 + Task 9. No new Prisma model (reuse `SiteSettings`) → Task 1. All spec sections map to a task.
