<!-- This Source Code Form is subject to the terms of the Mozilla Public
   - License, v. 2.0. If a copy of the MPL was not distributed with this
   - file, You can obtain one at https://mozilla.org/MPL/2.0/. -->

# Production Secrets — better-auth

Reference for the secrets the **production GitHub environment** must set so the
better-auth stack (magic-link + social OAuth + admin plugin) works in
production. Derived entirely from the application code, not from any `.env`
file.

Source of truth in code:

- `src/lib/auth.ts` — `betterAuth({...})` config (reads `AUTH_SECRET`, `AUTH_URL`)
- `src/lib/auth/social-providers-config.ts` — conditional social providers
- `src/lib/auth/apple-client-secret.ts` — Apple ES256 client-secret JWT generator
- `src/lib/email/send-magic-link-email.ts` — SMTP magic-link delivery
- `src/lib/auth-client.ts` — browser client (reads `NEXT_PUBLIC_BASE_URL`)

## How provider enabling works

A social provider is wired **only when both** its `*_CLIENT_ID` and
`*_CLIENT_SECRET` are present and non-empty (`buildSocialProvidersConfig`).
A provider with missing credentials is silently skipped — so production only
needs the secrets for the providers it actually intends to offer.

## OAuth redirect URIs

better-auth serves every provider callback at:

```
<AUTH_URL>/api/auth/callback/<provider>
```

Register the exact URL in each provider's developer console. With
`AUTH_URL = https://<production-host>`:

| Provider | Redirect URI to register                               |
| -------- | ------------------------------------------------------ |
| Google   | `https://<production-host>/api/auth/callback/google`   |
| Facebook | `https://<production-host>/api/auth/callback/facebook` |
| Twitter  | `https://<production-host>/api/auth/callback/twitter`  |
| Apple    | `https://<production-host>/api/auth/callback/apple`    |

## Core auth secrets (required)

| Name                   | Purpose                                                                                                                                                                                                        | NEW vs reused                                                                                                                                                             |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `AUTH_SECRET`          | better-auth signing/encryption secret (session cookies, magic-link tokens). Must be ≥ 32 chars; `auth.ts` throws otherwise.                                                                                    | **Reused** — same name/value the previous Auth.js deployment used. No rotation required by the migration, though rotating is always safe (invalidates existing sessions). |
| `AUTH_URL`             | Canonical base URL. Used as `baseURL` + sole `trustedOrigins` entry; also the prefix for every OAuth callback URL.                                                                                             | **Reused** — same name the previous deployment used.                                                                                                                      |
| `NEXT_PUBLIC_BASE_URL` | Browser-side `baseURL` for `authClient` so the client targets the same origin as the `/api/auth/[...all]` route. Public (inlined into the client bundle) — not a secret, but must be set at build/deploy time. | **Reused** — already used elsewhere in the app (e.g. purchase email links).                                                                                               |

> Note: the code reads `AUTH_SECRET` / `AUTH_URL` (not `BETTER_AUTH_SECRET` /
> `BETTER_AUTH_URL`). Do not introduce the `BETTER_AUTH_*` names — they are not
> read anywhere.

## Social OAuth providers (set per provider you enable)

| Name                          | Purpose                                                                                                                                                                                                                            | NEW vs reused                                                                  |
| ----------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| `GOOGLE_CLIENT_ID`            | Google OAuth client id                                                                                                                                                                                                             | **Reused** if Google sign-in already existed under Auth.js; otherwise **NEW**. |
| `GOOGLE_CLIENT_SECRET`        | Google OAuth client secret                                                                                                                                                                                                         | Same as above.                                                                 |
| `FACEBOOK_CLIENT_ID`          | Facebook OAuth app id                                                                                                                                                                                                              | **Reused** if previously configured; otherwise **NEW**.                        |
| `FACEBOOK_CLIENT_SECRET`      | Facebook OAuth app secret                                                                                                                                                                                                          | Same as above.                                                                 |
| `TWITTER_CLIENT_ID`           | X/Twitter OAuth client id                                                                                                                                                                                                          | **NEW** for most deployments (X sign-in is newly offered).                     |
| `TWITTER_CLIENT_SECRET`       | X/Twitter OAuth client secret                                                                                                                                                                                                      | Same as above.                                                                 |
| `APPLE_CLIENT_ID`             | Apple **Services ID** used as OAuth `client_id`                                                                                                                                                                                    | **NEW** unless Apple sign-in already existed.                                  |
| `APPLE_CLIENT_SECRET`         | Apple OAuth `client_secret` — a **signed ES256 JWT**, not a static string. Generate with `apple-client-secret.ts` from the team/key/private-key below. **Expires within 6 months — rotate before expiry or Apple sign-in breaks.** | **NEW** (must be generated).                                                   |
| `APPLE_APP_BUNDLE_IDENTIFIER` | Optional. Passed as `appBundleIdentifier` when present (native app token verification).                                                                                                                                            | **NEW** if using Apple; optional.                                              |

### Apple client-secret generation inputs

These are consumed by `generateAppleClientSecret(...)` (in
`apple-client-secret.ts`) to mint `APPLE_CLIENT_SECRET`. They are passed to the
generator (not read directly by `auth.ts`), but production must store them to
regenerate the JWT every ≤ 6 months:

| Name                | Purpose                                                 | NEW vs reused |
| ------------------- | ------------------------------------------------------- | ------------- |
| `APPLE_TEAM_ID`     | Apple Developer Team ID (10 chars) — JWT issuer.        | **NEW**       |
| `APPLE_KEY_ID`      | Key ID of the `.p8` signing key — JWT `kid` header.     | **NEW**       |
| `APPLE_PRIVATE_KEY` | Contents of the `.p8` EC private key (PEM). **Secret.** | **NEW**       |

> X/Twitter caveat (from code): X does not reliably return an email, so it is
> deliberately excluded from `accountLinkingConfig.trustedProviders`. X accounts
> cannot auto-link to an existing account by email — users link manually from
> their profile. No extra secret is required for this behavior.

## Magic-link email (SMTP) — required in production

`sendMagicLinkEmail` builds a Nodemailer SMTP transport from these vars and
throws if `EMAIL_FROM` is missing. **All are required in production** for
passwordless sign-in to deliver.

| Name                    | Purpose                                                      | NEW vs reused                                               |
| ----------------------- | ------------------------------------------------------------ | ----------------------------------------------------------- |
| `EMAIL_FROM`            | From address for the magic-link email. Send throws if unset. | **Reused** — same SMTP `from` the previous email flow used. |
| `EMAIL_SERVER_HOST`     | SMTP host.                                                   | **Reused**.                                                 |
| `EMAIL_SERVER_PORT`     | SMTP port (defaults to `25` if unset).                       | **Reused**.                                                 |
| `EMAIL_SERVER_USER`     | SMTP auth username.                                          | **Reused**.                                                 |
| `EMAIL_SERVER_PASSWORD` | SMTP auth password. **Secret.**                              | **Reused**.                                                 |

### ⚠️ E2E vs production divergence (important)

Real CI's E2E job injects **no** `EMAIL_FROM` / `EMAIL_SERVER_*`. This is **by
design**: `sendMagicLinkEmail` short-circuits and skips delivery entirely when
`E2E_MODE === 'true'` (better-auth still mints the verification token; only the
SMTP send is bypassed, so the sign-in success redirect the E2E tests assert is
not broken). Consequently:

- E2E passing does **not** prove SMTP is configured.
- **Production must set all five email vars** above, or magic-link sign-in will
  throw (`EMAIL_FROM is not configured`) and users cannot sign in.

## CAPTCHA (Turnstile) — required for the gated flows

Not part of better-auth itself, but the sign-in/checkout surfaces use
Cloudflare Turnstile.

| Name                              | Purpose                                    | NEW vs reused |
| --------------------------------- | ------------------------------------------ | ------------- |
| `NEXT_PUBLIC_CLOUDFLARE_SITE_KEY` | Public Turnstile site key (client widget). | **Reused**    |
| `CLOUDFLARE_SECRET`               | Server-side Turnstile verification secret. | **Reused**    |

(`NEXT_PUBLIC_CLOUDFLARE_TEST_SITE_KEY` is the always-pass dev/test key and is
not a production secret.)

## Summary checklist for the production GitHub environment

Required, always:

- `AUTH_SECRET` (≥ 32 chars), `AUTH_URL`, `NEXT_PUBLIC_BASE_URL`
- `EMAIL_FROM`, `EMAIL_SERVER_HOST`, `EMAIL_SERVER_PORT`, `EMAIL_SERVER_USER`,
  `EMAIL_SERVER_PASSWORD`
- `NEXT_PUBLIC_CLOUDFLARE_SITE_KEY`, `CLOUDFLARE_SECRET`

Required per enabled OAuth provider (omit a provider to disable it):

- Google: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`
- Facebook: `FACEBOOK_CLIENT_ID`, `FACEBOOK_CLIENT_SECRET`
- Twitter/X: `TWITTER_CLIENT_ID`, `TWITTER_CLIENT_SECRET`
- Apple: `APPLE_CLIENT_ID`, `APPLE_CLIENT_SECRET` (generated JWT),
  `APPLE_TEAM_ID`, `APPLE_KEY_ID`, `APPLE_PRIVATE_KEY`, and optionally
  `APPLE_APP_BUNDLE_IDENTIFIER`

Remember to register each provider's redirect URI
(`<AUTH_URL>/api/auth/callback/<provider>`) in its developer console, and to
schedule Apple `APPLE_CLIENT_SECRET` regeneration before its ≤ 6-month expiry.
