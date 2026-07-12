<!-- This Source Code Form is subject to the terms of the Mozilla Public
   - License, v. 2.0. If a copy of the MPL was not distributed with this
   - file, You can obtain one at https://mozilla.org/MPL/2.0/. -->

# Production Secrets — better-auth

Reference for the secrets the **production GitHub environment** must set so the
better-auth stack (magic-link + social OAuth + admin plugin) works in
production. Derived entirely from the application code, not from any `.env`
file.

> For the full end-to-end setup (services to provision, setup steps, the
> `emailVerified` migration, the NGINX same-origin requirement) see the
> canonical [`better-auth-setup-guide.md`](./better-auth-setup-guide.md). This
> doc is the secrets-focused companion.

Source of truth in code:

- `src/lib/auth.ts` — `betterAuth({...})` config (reads `AUTH_SECRET`, `AUTH_URL`; dynamic per-request `baseURL`)
- `src/lib/auth/social-providers-config.ts` — conditional social providers
- `src/lib/auth/apple-client-secret.ts` — Apple ES256 client-secret JWT generator
- `src/lib/email/send-magic-link-email.ts` — **AWS SES SDK** magic-link delivery (`SendRawEmailCommand`)
- `src/lib/utils/ses-client.ts` — SES client (reads `AWS_REGION` + standard AWS credential chain)
- `src/lib/auth-client.ts` — browser client (`baseURL` from `getApiBaseUrl()` — the served origin)

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

| Name          | Purpose                                                                                                                                                                                                                                                                                            | NEW vs reused                                                                                                                                                             |
| ------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `AUTH_SECRET` | better-auth signing/encryption secret (session cookies, magic-link tokens). Must be ≥ 32 chars; `auth.ts` throws otherwise.                                                                                                                                                                        | **Reused** — same name/value the previous Auth.js deployment used. No rotation required by the migration, though rotating is always safe (invalidates existing sessions). |
| `AUTH_URL`    | Canonical base URL. `buildAuthBaseURL()` derives a dynamic per-request `baseURL` from it — an allowlist of the apex host and its subdomains (apex + `*.apex`), which also serves as the trusted origins, so no separate `trustedOrigins` is needed. Still the prefix for every OAuth callback URL. | **Reused** — same name the previous deployment used.                                                                                                                      |

> Note: the code reads `AUTH_SECRET` / `AUTH_URL` (not `BETTER_AUTH_SECRET` /
> `BETTER_AUTH_URL`, and not the old Auth.js `NEXTAUTH_URL`). Do not introduce
> those names — they are not read anywhere.
>
> The browser `authClient` no longer reads `NEXT_PUBLIC_BASE_URL`; its `baseURL`
> now comes from `getApiBaseUrl()` (the served origin) so the auth request stays
> same-origin regardless of whether the page was served from the apex or `www`.
> `NEXT_PUBLIC_BASE_URL` may still be used elsewhere (e.g. purchase email links),
> but it is no longer part of the auth wiring.

## Optional config (NOT secrets)

Plain feature flags read by `auth.ts`. **Do not store these as GitHub Actions
secrets** — set them (if at all) as ordinary environment variables in the
deployment environment.

| Name                  | Purpose                                                                                                                                                                                                                              | Default                  |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------ |
| `AUTH_DISABLE_SIGNUP` | Operational kill switch for new signups. When `"true"`, the magic-link verify step refuses unknown emails (`new_user_signup_disabled`) so new users must go through `/signup`. Read at startup — toggling requires a server restart. | Unset = signups **open** |

## Social OAuth providers (set per provider you enable)

| Name                          | Purpose                                                                                 | NEW vs reused                                                                  |
| ----------------------------- | --------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| `GOOGLE_CLIENT_ID`            | Google OAuth client id                                                                  | **Reused** if Google sign-in already existed under Auth.js; otherwise **NEW**. |
| `GOOGLE_CLIENT_SECRET`        | Google OAuth client secret                                                              | Same as above.                                                                 |
| `FACEBOOK_CLIENT_ID`          | Facebook OAuth app id                                                                   | **Reused** if previously configured; otherwise **NEW**.                        |
| `FACEBOOK_CLIENT_SECRET`      | Facebook OAuth app secret                                                               | Same as above.                                                                 |
| `TWITTER_CLIENT_ID`           | X/Twitter OAuth client id                                                               | **NEW** for most deployments (X sign-in is newly offered).                     |
| `TWITTER_CLIENT_SECRET`       | X/Twitter OAuth client secret                                                           | Same as above.                                                                 |
| `APPLE_CLIENT_ID`             | Apple **Services ID** used as OAuth `client_id`                                         | **NEW** unless Apple sign-in already existed.                                  |
| `APPLE_APP_BUNDLE_IDENTIFIER` | Optional. Passed as `appBundleIdentifier` when present (native app token verification). | **NEW** if using Apple; optional.                                              |

### Apple client secret: runtime minting (preferred) vs static

Apple's `client_secret` is a **signed ES256 JWT** capped at 6 months of
validity — not a static string. There are two ways to supply it; set the key
material and forget rotation forever:

**Preferred — runtime minting.** Set all three and the server mints a fresh
6-month secret at every boot (`resolveAppleClientSecret()` in
`social-providers-config.ts`); no rotation, no expiry, ever (the `.p8` key
itself does not expire). See
`docs/auto-generated/apple-client-secret-runtime-minting.md`.

| Name                       | Purpose                                                                    | NEW vs reused |
| -------------------------- | -------------------------------------------------------------------------- | ------------- |
| `APPLE_TEAM_ID`            | Apple Developer Team ID (10 chars) — JWT issuer.                           | **NEW**       |
| `APPLE_KEY_ID`             | Key ID of the `.p8` signing key — JWT `kid` header.                        | **NEW**       |
| `APPLE_PRIVATE_KEY_BASE64` | **Base64-encoded** contents of the `.p8` EC private key (PEM). **Secret.** | **NEW**       |

The key is base64-encoded (like `CLOUDFRONT_PRIVATE_KEY_BASE64`) because a
multi-line PEM cannot survive the `KEY=value` env-file format:
`base64 -i AuthKey_XXXXXXXXXX.p8 | pbcopy`.

**Fallback — static secret.** Only used when the key material above is absent
(or minting fails). Generate offline with `generateAppleClientSecret(...)` and
store the JWT; **it expires within 6 months** — the expiry monitor
(`apple-secret-expiry-monitor.ts`) warns to Grafana starting 30 days out.

| Name                  | Purpose                                        | NEW vs reused                |
| --------------------- | ---------------------------------------------- | ---------------------------- |
| `APPLE_CLIENT_SECRET` | Pre-minted Apple `client_secret` JWT (static). | **NEW** (must be generated). |

> X/Twitter caveat (from code): X does not reliably return an email, so it is
> deliberately excluded from `accountLinkingConfig.trustedProviders`. X accounts
> cannot auto-link to an existing account by email — users link manually from
> their profile. No extra secret is required for this behavior.

## Magic-link email (AWS SES) — required in production

`sendMagicLinkEmail` delivers via the **AWS SES SDK** (`SendRawEmailCommand`),
**not** an outbound SMTP socket (SMTP ports 25/587 are firewalled in the deploy
environment and time out — this was the cause of the old sign-in `ETIMEDOUT`).
It throws if `EMAIL_FROM` is missing, and the SES client uses the standard AWS
credential chain.

| Name                    | Purpose                                                                | NEW vs reused                       |
| ----------------------- | ---------------------------------------------------------------------- | ----------------------------------- |
| `EMAIL_FROM`            | From address — must be an SES-verified identity. Send throws if unset. | **Reused**.                         |
| `AWS_ACCESS_KEY_ID`     | AWS credentials for the SES (and S3) clients.                          | **Reused** (S3 already used these). |
| `AWS_SECRET_ACCESS_KEY` | AWS credentials. **Secret.**                                           | **Reused**.                         |
| `AWS_REGION`            | SES region. Defaults to `us-east-1` if unset.                          | **Reused**.                         |

> ✅ **No SMTP vars.** The old SMTP config (`EMAIL_SERVER_HOST` /
> `EMAIL_SERVER_USER` / `EMAIL_SERVER_PASSWORD` / `EMAIL_SERVER_PORT`) has been
> removed from `env-validation.ts` and is no longer read or required anywhere.
> Do not set them.

### ⚠️ E2E vs production divergence (important)

Real CI's E2E job injects **no** `EMAIL_FROM` / SES config. This is **by
design**: `sendMagicLinkEmail` short-circuits and skips delivery entirely when
`E2E_MODE === 'true'` (better-auth still mints the verification token; only the
SES send is bypassed, so the sign-in success redirect the E2E tests assert is
not broken). Consequently:

- E2E passing does **not** prove SES is configured.
- **Production must set `EMAIL_FROM` + the AWS credentials/region** above (and a
  verified SES identity), or magic-link sign-in throws
  (`EMAIL_FROM is not configured`, or an SES send error) and users cannot sign
  in.

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

- `AUTH_SECRET` (≥ 32 chars), `AUTH_URL`, `DATABASE_URL`
- `EMAIL_FROM`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_REGION` (SES delivery)
- `NEXT_PUBLIC_CLOUDFLARE_SITE_KEY`, `CLOUDFLARE_SECRET`

Required per enabled OAuth provider (omit a provider to disable it):

- Google: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`
- Facebook: `FACEBOOK_CLIENT_ID`, `FACEBOOK_CLIENT_SECRET`
- Twitter/X: `TWITTER_CLIENT_ID`, `TWITTER_CLIENT_SECRET`
- Apple: `APPLE_CLIENT_ID` + the minting trio `APPLE_TEAM_ID`, `APPLE_KEY_ID`,
  `APPLE_PRIVATE_KEY_BASE64` (preferred — no rotation ever), or a static
  `APPLE_CLIENT_SECRET` (generated JWT, expires ≤ 6 months); optionally
  `APPLE_APP_BUNDLE_IDENTIFIER`

Remember to register each provider's redirect URI
(`<AUTH_URL>/api/auth/callback/<provider>`) in its developer console. With
runtime minting there is no Apple secret rotation to schedule; on the static
path the Grafana `apple-secret-expiry` alert emails 30 days before expiry.
