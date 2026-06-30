<!-- This Source Code Form is subject to the terms of the Mozilla Public
   - License, v. 2.0. If a copy of the MPL was not distributed with this
   - file, You can obtain one at https://mozilla.org/MPL/2.0/. -->

# Signup agreements block + cross-auth opt-in persistence

_2026-06-30_

## Problem

The signup card collects three opt-ins — **accept terms** (required), **SMS
updates**, **email updates** — plus a **Turnstile** bot check. Today these only
gate and feed the **magic-link** path (via `signupAction`). A user who toggles
them and then clicks a **social** provider button loses those choices: social
sign-up creates the user inside better-auth's `user.create.before` hook, which
never sees the client form state. Terms acceptance is also not enforced for
social sign-up at all.

Goal: one agreements block that applies to **every** auth mechanism, and the
chosen opt-ins persist whether the user finishes via magic-link or social OAuth.

## Layout

On the signup card, directly beneath the SIGN-UP heading, render an
**agreements block**:

- Terms toggle · SMS toggle · Email toggle (signup only — `hasTermsAndConditions`)
- Turnstile widget (rendered up top for both signin and signup)
- A thick **black divider** (the `Separator` style used by the OR rule) closing
  the block

Below the divider, the existing flow is unchanged: social buttons → "or continue
with email" → email input → submit. The three toggles move out of their current
position lower in the form; no copy changes.

## Gating (all paths)

A signup is allowed only once **terms accepted AND Turnstile verified**:

- **Magic-link submit** — already gated on terms (zod `refine`) + Turnstile
  (`isVerified`). Unchanged.
- **Social buttons** — `SocialProviderButtons` gains a `disabled` prop; the
  signup page passes `!(termsAccepted && isVerified)`. On the **signin** page
  there are no terms, so the gate is Turnstile-only (terms term defaults true).

## Persistence

- **Magic-link**: `signupAction` already reads `termsAndConditions`,
  `allowSmsNotifications`, `allowEmailNotifications` from the parsed form and
  writes them via `UserRepository.create`. Unchanged.
- **Social OAuth**: before calling `authClient.signIn.social`, the client calls
  a new server action **`stashSignupConsent({ turnstileToken, allowSms,
allowEmail })`** that:
  1. verifies the Turnstile token server-side (reuse `verifyTurnstile`), and
  2. on success, sets a **short-lived, signed, httpOnly cookie**
     (`signup_consent`, ~10 min) holding `{ termsAcceptedAt, allowSms,
allowEmail }`.

  better-auth's `user.create.before` hook (`userCreateBeforeHook`) reads that
  cookie when creating a brand-new OAuth user, applies the fields, and clears
  the cookie. Returning users (no create) and the magic-link path ignore it.

  The action only runs when terms are accepted (the button is otherwise
  disabled), so the cookie always implies terms acceptance.

### Architecture risk + fallback

This depends on `user.create.before` being able to read request cookies. If
better-auth does not pass request/header context to the database hook, the
fallback is a **post-callback reconciliation**: the cookie persists, and a
client effect on the post-OAuth landing calls a server action that applies the
cookie's opt-ins to the current session user, then clears it. The cookie
contract is identical either way; only the reader changes. Verify the hook's
context access first; do not commit to the hook path until confirmed.

## Components / boundaries

| Unit                        | Responsibility                                                                                               | Depends on               |
| --------------------------- | ------------------------------------------------------------------------------------------------------------ | ------------------------ |
| `SignupSigninForm`          | Render agreements block + black divider; keep toggles in form state                                          | RHF control              |
| `SocialProviderButtons`     | New `disabled` prop gates all four buttons                                                                   | —                        |
| signup `page.tsx`           | Compute `gateOpen = termsAccepted && isVerified`; on social click, `stashSignupConsent` then `signIn.social` | authClient, stash action |
| `stashSignupConsent` action | Verify Turnstile, set signed httpOnly `signup_consent` cookie                                                | verifyTurnstile, cookies |
| `userCreateBeforeHook`      | Read/clear `signup_consent`, apply opt-ins to the new user (additive to existing pause/username logic)       | cookies                  |

## Testing (TDD)

- `stashSignupConsent`: rejects on bad Turnstile (no cookie); sets the signed
  cookie with the right payload on success.
- `userCreateBeforeHook`: applies opt-ins from a present cookie and clears it;
  is a no-op when the cookie is absent; preserves existing pause/username
  behavior.
- `SocialProviderButtons`: respects `disabled`.
- `SignupSigninForm`: renders the agreements block (terms + SMS + email +
  Turnstile + black divider) beneath the heading on signup.
- signup `page`: social click is blocked until the gate opens; stashes consent
  before `signIn.social`.

## Out of scope

- No change to the profile opt-out UI (already exists).
- No change to how SMS/email are later consumed (notification fan-out).
- No new opt-in surfaced on the signin page.
