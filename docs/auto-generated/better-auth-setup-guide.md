<!-- This Source Code Form is subject to the terms of the Mozilla Public
   - License, v. 2.0. If a copy of the MPL was not distributed with this
   - file, You can obtain one at https://mozilla.org/MPL/2.0/. -->

# better-auth Setup Guide

_Last updated: 2026-06-29_

End-to-end setup for the boudreaux auth stack: **passwordless magic-link
sign-in + social OAuth + the admin plugin**, all on better-auth. This is the
canonical reference — it lists every environment variable, the external
services to provision, and the one-time setup steps (including the data
migration and the reverse-proxy requirement the same-origin auth fix depends
on). Everything here is derived from the application code, never from any
`.env*` file.

> **Companion docs**
>
> - [`better-auth-production-secrets.md`](./better-auth-production-secrets.md) —
>   secrets-focused reference (which GitHub Actions secrets to set, NEW-vs-reused
>   provenance, Apple JWT rotation).
> - [`PRODUCTION_ENV_SETUP.md`](./PRODUCTION_ENV_SETUP.md) — the GitHub
>   Secrets → EC2 deployment mechanics.

## Source of truth in code

| File                                           | Reads / does                                                                                                                                                 |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `src/lib/auth.ts`                              | `betterAuth({...})` — reads `AUTH_SECRET`, `AUTH_URL`, `AUTH_DISABLE_SIGNUP`, `E2E_MODE`, `NODE_ENV`; dynamic per-request `baseURL` via `buildAuthBaseURL()` |
| `src/lib/auth-client.ts`                       | Browser client — `baseURL` from `getApiBaseUrl()` (served origin)                                                                                            |
| `src/lib/utils/api-base-url.ts`                | `getApiBaseUrl()` — server uses `AUTH_URL`, client uses `location.origin`                                                                                    |
| `src/lib/auth/social-providers-config.ts`      | Conditionally wires Google / Facebook / Twitter / Apple from env                                                                                             |
| `src/lib/auth/apple-client-secret.ts`          | Standalone helper to mint the Apple ES256 client-secret JWT (offline)                                                                                        |
| `src/lib/email/send-magic-link-email.ts`       | Sends the magic-link email via **AWS SES SDK** (`SendRawEmailCommand`)                                                                                       |
| `src/lib/utils/ses-client.ts`                  | Lazy SES client — reads `AWS_REGION` (+ standard AWS credential chain)                                                                                       |
| `src/lib/config/env-validation.ts`             | Boot-time required-env gate (production only)                                                                                                                |
| `scripts/migrate-email-verified-to-boolean.ts` | One-time `emailVerified` DateTime → Boolean migration                                                                                                        |

## External services to provision

| Service                   | Why                                                                  | Required?                          |
| ------------------------- | -------------------------------------------------------------------- | ---------------------------------- |
| **MongoDB** (Atlas/self)  | Primary datastore + better-auth session/account/user storage         | Yes                                |
| **AWS SES**               | Delivers the magic-link sign-in email (and other transactional mail) | Yes — sign-in is broken without it |
| **AWS IAM**               | Credentials for SES + S3 (presigned download/upload URLs)            | Yes                                |
| **Cloudflare Turnstile**  | CAPTCHA on the sign-in / sign-up / checkout surfaces                 | Yes                                |
| **Google Cloud Console**  | Google OAuth client (Sign in with Google)                            | Optional — per provider you offer  |
| **Meta for Developers**   | Facebook OAuth app                                                   | Optional                           |
| **X / Twitter Developer** | X OAuth client                                                       | Optional                           |
| **Apple Developer**       | Apple Services ID + `.p8` signing key (Sign in with Apple)           | Optional                           |

A social provider is wired **only when both** its `*_CLIENT_ID` and
`*_CLIENT_SECRET` are present and non-empty (`buildSocialProvidersConfig`); a
provider with missing credentials is silently skipped. So you only provision the
providers you actually intend to offer.

## Environment variables

### Core auth (required)

| Name           | Purpose                                                                                                                             |
| -------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `AUTH_SECRET`  | better-auth signing/encryption secret (session cookies + magic-link tokens). **Must be ≥ 32 chars** or `auth.ts` throws at startup. |
| `AUTH_URL`     | Canonical base URL, e.g. `https://fakefourrecords.com`. Drives the dynamic `baseURL` allowlist + every OAuth callback prefix.       |
| `DATABASE_URL` | MongoDB connection string (`mongodb+srv://…` or `mongodb://…`). A non-`mongodb` value logs a warning.                               |

> The code reads `AUTH_SECRET` / `AUTH_URL` — **not** `BETTER_AUTH_SECRET` /
> `BETTER_AUTH_URL` and **not** the old Auth.js `NEXTAUTH_URL`. Do not introduce
> those names; they are read nowhere.

#### How the base URL resolves (same-origin auth)

`buildAuthBaseURL()` parses `AUTH_URL` and returns a **dynamic** config:

```text
{ allowedHosts: [<apex>, '*.<apex>'], protocol: 'https'|'http', fallback: AUTH_URL }
```

This lets better-auth resolve the base URL from the **served host** (apex,
`www`, or any subdomain) so the auth request stays same-origin — keeping it
under CSP `connect-src 'self'` and the host-only session cookie first-party. A
`www.` prefix on `AUTH_URL` is stripped so apex and `www` share one allowlist.
An unset `AUTH_URL` ⇒ no `baseURL`; a malformed one ⇒ used verbatim as a static
string (preserving the prior behavior). The browser client mirrors this via
`getApiBaseUrl()` (`location.origin`).

> **Reverse-proxy requirement:** better-auth derives the served host from the
> proxy's `X-Forwarded-Host` header. NGINX (or whatever fronts the app) **must
> forward the real public host** — otherwise the base URL falls back to
> `AUTH_URL` and the apex/`www` same-origin guarantee is lost. See the NGINX
> step below.

### Magic-link email delivery — AWS SES (required)

Delivery goes through the **SES SDK** (`SendRawEmailCommand`), not an outbound
SMTP socket (SMTP port 25/587 is firewalled in the deploy environment and times
out). The SES client uses the standard AWS credential chain.

| Name                    | Purpose                                                                                                                    |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `EMAIL_FROM`            | From address for the magic-link email. The send **throws if unset**. Must be an SES-verified identity (domain or address). |
| `AWS_ACCESS_KEY_ID`     | AWS credentials for the SES (and S3) clients.                                                                              |
| `AWS_SECRET_ACCESS_KEY` | AWS credentials.                                                                                                           |
| `AWS_REGION`            | SES region. Defaults to `us-east-1` if unset.                                                                              |

> **SES sandbox:** a brand-new SES account is sandboxed (can only send to
> verified addresses). Request production access before launch, and verify the
> `EMAIL_FROM` domain/identity (DKIM) so mail is not rejected or spam-filed.

> **No SMTP vars.** The old SMTP config — `EMAIL_SERVER_HOST` /
> `EMAIL_SERVER_USER` / `EMAIL_SERVER_PASSWORD` / `EMAIL_SERVER_PORT` — has been
> removed from `env-validation.ts` and is no longer read or required anywhere.
> Do not set them.

### CAPTCHA — Cloudflare Turnstile (required)

| Name                              | Purpose                                    |
| --------------------------------- | ------------------------------------------ |
| `NEXT_PUBLIC_CLOUDFLARE_SITE_KEY` | Public Turnstile site key (client widget). |
| `CLOUDFLARE_SECRET`               | Server-side Turnstile verification secret. |

(`NEXT_PUBLIC_CLOUDFLARE_TEST_SITE_KEY` is the always-pass dev/test key — not a
production secret.)

### Social OAuth providers (set per provider you enable)

Quick reference — set both vars for each provider you want to offer; a provider
with either var missing is silently skipped:

| Provider    | Variables                                                                                             |
| ----------- | ----------------------------------------------------------------------------------------------------- |
| Google      | `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`                                                            |
| Facebook    | `FACEBOOK_CLIENT_ID`, `FACEBOOK_CLIENT_SECRET`                                                        |
| Twitter / X | `TWITTER_CLIENT_ID`, `TWITTER_CLIENT_SECRET`                                                          |
| Apple       | `APPLE_CLIENT_ID`, `APPLE_CLIENT_SECRET` (a signed ES256 JWT), optional `APPLE_APP_BUNDLE_IDENTIFIER` |

**OAuth redirect URI** for every provider (register the exact URL in each
provider's developer console):

```text
<AUTH_URL>/api/auth/callback/<provider>
```

e.g. `https://fakefourrecords.com/api/auth/callback/google`. The path is fixed
by better-auth and must match **byte-for-byte** (scheme, host, no trailing
slash) or the provider returns a redirect-URI-mismatch error. Add the
`http://localhost:3000/api/auth/callback/<provider>` variant too if you test
OAuth locally.

**Account auto-linking** fires for `google`, `apple`, `facebook` (a verified
email that matches an existing account links automatically). **Twitter/X is
deliberately excluded** — X does not reliably return an email without elevated
permissions, so users link X manually from their profile.

### Registering each provider

> Console UIs change frequently; the URLs and navigation below were verified
> 2026-06-29. If a label has moved, search the provider's current docs — the
> redirect URI and the env-var mapping are the parts that stay fixed.

#### Google

**Console:** https://console.cloud.google.com/auth/clients
**Provides:** `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`

1. Go to https://console.cloud.google.com/ and create (or select) a project
   from the project picker in the top bar.
2. Open the **Google Auth Platform** (the consolidated home for OAuth config,
   formerly "OAuth consent screen"):
   https://console.cloud.google.com/auth/overview — if the project has never
   been configured, click **Get started** and fill in **App name**, **User
   support email**, **Audience = External**, and a **Developer contact** email.
3. Set **Branding** (https://console.cloud.google.com/auth/branding): app name,
   support email, optional logo/domain. A logo or sensitive scopes can trigger
   Google verification — skip the logo for a basic email/profile sign-in.
4. Under **Data Access** (https://console.cloud.google.com/auth/scopes) add the
   non-sensitive scopes **`openid`**, **`email`**, **`profile`**. That is all
   better-auth needs; none require Google verification.
5. Go to **Clients** (https://console.cloud.google.com/auth/clients) → **Create
   client** → **Application type: Web application** and name it.
6. Add **Authorized redirect URIs** → exactly
   `<AUTH_URL>/api/auth/callback/google` (plus the localhost variant for dev).
7. (Optional) **Authorized JavaScript origins** = `<AUTH_URL>` — the bare origin
   with **no path**. Only needed for browser-side Google JS; the standard
   better-auth server redirect flow works without it.
8. Click **Create**, then copy **Client ID** → `GOOGLE_CLIENT_ID` and **Client
   secret** → `GOOGLE_CLIENT_SECRET`. The secret is shown **once** (later stored
   hashed) — save it immediately.
9. On **Audience** (https://console.cloud.google.com/auth/audience): while
   **Publishing status = Testing**, only listed **Test users** can sign in
   (others get `access_denied`). Click **Publish app → In production** for
   public sign-in — with only `openid email profile` scopes this needs no
   review.

- Ensure `AUTH_URL` is set so better-auth builds the same callback it
  registered (otherwise it can default to localhost in prod and mismatch).
- Redirect-URI / origin changes can take 5 min to a few hours to propagate.

#### Facebook

**Console:** https://developers.facebook.com/apps/
**Provides:** `FACEBOOK_CLIENT_ID` (App ID), `FACEBOOK_CLIENT_SECRET` (App Secret)

1. Sign in at https://developers.facebook.com/ (register as a developer if
   prompted), open the App Dashboard at https://developers.facebook.com/apps/,
   and click **Create app**.
2. On the **Use cases** step, select **"Authenticate and request data from
   users with Facebook Login"** (the current replacement for the old "Consumer"
   type), enter an app name + contact email, and finish creation.
3. Under **Products** in the left nav, ensure **Facebook Login** is added (use
   **Add product** if not), then open **Facebook Login → Settings**.
4. Under **Client OAuth Settings**, set **Valid OAuth Redirect URIs** to exactly
   `<AUTH_URL>/api/auth/callback/facebook` (plus the localhost variant for dev).
   Keep **Client OAuth Login** and **Web OAuth Login** enabled and **Save
   changes**. Meta uses strict URI matching.
5. Go to **App settings → Basic**; copy **App ID** → `FACEBOOK_CLIENT_ID` and
   **App Secret** (click **Show**) → `FACEBOOK_CLIENT_SECRET`.
6. App Mode: a new app starts in **Development** mode — only app
   admins/developers/testers (under **App roles**) can sign in. Toggle the app
   to **Live** at the top of the dashboard to allow the public.
7. `email` + `public_profile` work in Development mode. For `email` in **Live**
   mode you must complete **business verification** (and possibly App Review for
   advanced access), or sign-in returns no email for non-role users.

#### Twitter / X

**Console:** https://developer.x.com/en/portal/dashboard (formerly
developer.twitter.com)
**Provides:** `TWITTER_CLIENT_ID`, `TWITTER_CLIENT_SECRET` (OAuth 2.0)

1. Sign in at https://developer.x.com/en/portal/dashboard. Create a **Project**,
   then add an **App** inside it (a Project is required for OAuth 2.0 / API v2).
2. Open the App → **Settings**, and under **User authentication settings** click
   **Set up** (or **Edit**).
3. Set **App permissions** to at least **Read** (to read the user's profile).
4. Set **Type of App** to **Web App, Automated App or Bot** — the confidential
   client that yields a Client Secret.
5. In **Callback URI / Redirect URL** enter exactly
   `<AUTH_URL>/api/auth/callback/twitter` (plus the localhost variant for dev).
6. Fill in the required **Website URL** (e.g. `<AUTH_URL>`), then **Save**.
7. To get the user's email, enable **Request email from users** / the
   `user.email` scope. This is **not** granted by default — X gates email behind
   elevated/special permission you must apply for. Until then sign-in works but
   X returns no email.
8. Open the App's **Keys and Tokens** tab → **OAuth 2.0 Client ID and Client
   Secret**: copy **Client ID** → `TWITTER_CLIENT_ID` and generate/copy **Client
   Secret** → `TWITTER_CLIENT_SECRET`. The secret is shown **once**; if lost you
   must regenerate (invalidating the old one).

> Because of the email-scope gate above, X is intentionally **excluded** from
> this app's trusted auto-linking providers — without a reliable verified email
> the by-email account link can't match an existing user. Users who want their X
> sign-in linked must obtain email access from X, or link manually while signed
> in.

#### Apple

**Console:** https://developer.apple.com/account/resources/identifiers/list
**Provides:** `APPLE_CLIENT_ID` (Services ID), `APPLE_CLIENT_SECRET` (generated
ES256 JWT), optional `APPLE_APP_BUNDLE_IDENTIFIER`

1. Sign in at https://developer.apple.com/account and open **Certificates,
   Identifiers & Profiles** (https://developer.apple.com/account/resources).
   Note your **Team ID** (10 chars) from **Membership details**.
2. Create a primary **App ID**: Identifiers → **+** → **App IDs** → **App**, then
   under **Capabilities** check **Sign In with Apple**. Register it.
3. Create the **Services ID**: Identifiers → **+** → **Services IDs** →
   Continue. Give it a reverse-domain identifier (e.g.
   `com.fakefourrecords.web`) and register — this identifier becomes
   `APPLE_CLIENT_ID`.
4. Configure the Services ID: select it → check **Sign in with Apple** →
   **Configure**, and pick the primary App ID from step 2.
5. Under **Website URLs**, add your domain in **Domains and Subdomains** (e.g.
   `fakefourrecords.com`) and exactly `<AUTH_URL>/api/auth/callback/apple` in
   **Return URLs**. **Next → Done → Continue → Save**.
6. Create the signing key: **Keys**
   (https://developer.apple.com/account/resources/authkeys/list) → **+** → name
   it, check **Sign in with Apple**, **Configure** (select the primary App ID) →
   **Continue → Register**.
7. **Download** the `.p8` file (offered **once** — store it securely, it cannot
   be re-downloaded) and record the **Key ID** from the key's detail page.
8. Generate `APPLE_CLIENT_SECRET` offline (see below), set `APPLE_CLIENT_ID` to
   the Services ID, and — only for a native iOS companion app — set
   `APPLE_APP_BUNDLE_IDENTIFIER` to the primary App ID.

- Apple disallows `localhost` and non-HTTPS: the Return URL must be **HTTPS** and
  match `<AUTH_URL>/api/auth/callback/apple` exactly, on a domain you've added to
  the Services ID's Domains list.
- The `email` claim is returned **only on first authorization** and may be an
  Apple **private relay** address (`@privaterelay.appleid.com`) — persist it on
  first sign-in.

#### Generating `APPLE_CLIENT_SECRET` (signed JWT, ≤ 6-month expiry)

`APPLE_CLIENT_SECRET` is a **signed ES256 JWT**, not a fixed string, and
**expires within 6 months** (Apple caps it at `15_777_000` s) — schedule
regeneration or Apple sign-in breaks. Mint it offline with
`generateAppleClientSecret(...)` from `src/lib/auth/apple-client-secret.ts`:

| Input        | From Apple Developer                                    |
| ------------ | ------------------------------------------------------- |
| `teamId`     | Developer Team ID (10 chars) — JWT issuer.              |
| `keyId`      | Key ID of the `.p8` signing key — JWT `kid` header.     |
| `clientId`   | The **Services ID** (same value as `APPLE_CLIENT_ID`).  |
| `privateKey` | Contents of the `.p8` EC private key (PEM). **Secret.** |

The running app reads only the resulting `APPLE_CLIENT_SECRET`. Store the
team/key/`.p8`/Services ID securely so you can regenerate and redeploy every
≤ 6 months **before** expiry.

### Operational flags (NOT secrets)

Set as ordinary env vars in the deployment environment, not GitHub Actions
secrets.

| Name                  | Purpose                                                                                                                                                             | Default              |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------- |
| `AUTH_DISABLE_SIGNUP` | Kill switch for new signups. `"true"` ⇒ magic-link verify refuses unknown emails (funnels new users through `/signup`). Read at startup — toggling needs a restart. | Unset = signups open |

> An in-app admin toggle also exists for pausing signups; `AUTH_DISABLE_SIGNUP`
> is the env-level override / kill switch.

## One-time setup steps

1. **Provision services** (above): MongoDB, AWS SES (verify `EMAIL_FROM` domain,
   request production access), an IAM user/role with SES + S3 permissions,
   Cloudflare Turnstile, and each OAuth provider you intend to offer.

2. **Generate `AUTH_SECRET`** (≥ 32 chars):

   ```bash
   openssl rand -base64 32
   ```

3. **Register each OAuth provider** you intend to offer — follow
   [Registering each provider](#registering-each-provider) for the exact console
   URLs and steps (redirect URI `<AUTH_URL>/api/auth/callback/<provider>`). For
   Apple, also generate `APPLE_CLIENT_SECRET` (see
   [Generating `APPLE_CLIENT_SECRET`](#generating-apple_client_secret-signed-jwt--6-month-expiry)).

4. **Set the env vars** in the production environment (GitHub Actions secrets →
   `.env` on EC2; see `PRODUCTION_ENV_SETUP.md` for the deploy mechanics).

5. **NGINX host forwarding — already configured (no action needed).** The
   same-origin base-URL resolution needs the proxy to forward the public host:

   ```nginx
   proxy_set_header Host              $host;
   proxy_set_header X-Forwarded-Host  $host;
   proxy_set_header X-Forwarded-Proto $scheme;
   ```

   These are **already present in `nginx/nginx.conf`** on every proxy `location`
   block (`/api/`, the dedicated auth-endpoints block, and `/`), and that file is
   **baked into the nginx image** (`nginx/Dockerfile` `COPY`s it to
   `/etc/nginx/conf.d/default.conf`). The deploy's `build-nginx` job rebuilds and
   pushes that image on every run, so the headers ship automatically — there is
   nothing to add to `deploy.yml`. Just **don't remove these lines** from
   `nginx.conf`, and when moving to a new domain update `server_name`
   (currently `fakefourrecords.com www.fakefourrecords.com`) and the TLS certs.

   > Because the config is image-baked (not volume-mounted), an edit to
   > `nginx.conf` only takes effect once the nginx image is rebuilt — which the
   > deploy does; a bare `docker compose restart nginx` on the box would not.

6. **`emailVerified` migration — already run. ✅** This one-time migration has
   been executed; no action needed for existing data. It converted pre-migration
   (Auth.js-era) users' `emailVerified` field from a `DateTime` to the `Boolean`
   that better-auth's schema expects — the mismatch had been throwing `P2023` on
   magic-link verify for those users, blocking their sign-in. After the
   migration, those legacy accounts verify and sign in normally.

   The script remains in the repo (`scripts/migrate-email-verified-to-boolean.ts`)
   for reference or for any future environment seeded from old data. It defaults
   to a dry-run; pass `--execute` to write, and it targets whatever
   `DATABASE_URL` the process resolves:

   ```bash
   # Dry-run (counts affected docs) — should now report 0 on migrated DBs
   pnpm exec tsx scripts/migrate-email-verified-to-boolean.ts

   # Apply (only needed on a not-yet-migrated environment)
   pnpm exec tsx scripts/migrate-email-verified-to-boolean.ts --execute
   ```

7. **Smoke-test sign-in** in production: request a magic link, confirm the email
   arrives via SES, click through, and verify each enabled OAuth provider
   completes its callback.

## Verifying the setup

- **Startup**: the app logs `✅ Environment validation passed`. A
  `Missing required environment variables: …` throw means one of the
  `env-validation.ts` required keys is unset.
- **Magic-link**: a successful send logs `[sendMagicLinkEmail] Magic-link email
sent to <addr>`. `EMAIL_FROM is not configured` ⇒ `EMAIL_FROM` is unset.
- **Same-origin**: the browser's `get-session` request should be same-origin
  (no CSP `connect-src` block). A cross-origin request usually means NGINX is
  not forwarding `X-Forwarded-Host`.
