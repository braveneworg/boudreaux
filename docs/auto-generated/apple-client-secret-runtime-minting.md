# Apple client secret: runtime minting + expiry alerting

Last updated: 2026-07-11

## The problem this solves

Apple is the only OAuth provider whose `client_secret` is not a static string:
it must be a **signed ES256 JWT** whose validity Apple caps at **6 months**.
A pre-minted secret stored in a GitHub secret therefore breaks Apple sign-in
on a calendar date unless a human remembers to regenerate and rotate it —
an operational chore with a silent failure mode (the first symptom is
`[Better Auth]: Provider not found`-style sign-in errors in production logs).

Rather than reminding a human every six months, the server now **mints the
secret itself at every boot**. The `.p8` signing key never expires, deploys
happen near-daily, so a running instance is never more than one deploy away
from a fresh 6-month secret. The chore is eliminated, not scheduled.

## How it works

```text
boot ─▶ resolveAppleClientSecret()            src/lib/auth/social-providers-config.ts
          │
          ├─ APPLE_TEAM_ID + APPLE_KEY_ID + APPLE_PRIVATE_KEY_BASE64 set?
          │    └─ yes ─▶ generateAppleClientSecret()   ─▶ { source: 'minted' }
          │              (sync ES256 via node:crypto,
          │               exp = now + 6 months)
          │    └─ mint throws? ─▶ log error, fall through
          │
          ├─ APPLE_CLIENT_SECRET set? ─▶ { source: 'static' }
          └─ neither ─▶ null (Apple sign-in disabled)
```

- `generateAppleClientSecret` (`src/lib/auth/apple-client-secret.ts`) is
  **synchronous** — `node:crypto`'s `sign` with `dsaEncoding: 'ieee-p1363'`
  produces the raw `r||s` signature JOSE requires. Sync matters because the
  better-auth config is built at module init in `src/lib/auth.ts`; an async
  signer would force top-level await through the auth module.
- A minting failure (corrupt base64, malformed PEM) **never crashes the
  server**: it logs an error and degrades to the static secret when present,
  otherwise Apple is simply omitted — the same conditional-wiring philosophy
  the other providers use.
- Minting wins over the static secret when both are configured.

## The expiry monitor (defense in depth)

`src/lib/auth/apple-secret-expiry-monitor.ts`, started from `src/lib/auth.ts`
in production runtime only (never E2E, dev, or tests):

- At boot and then **hourly**, decodes the active secret's `exp` claim
  (signature not verified — observability only) and logs:
  - `info` "Apple client secret expiry check" while healthy (≥ 30 days),
  - `warn` **"Apple client secret expiring soon"** under 30 days,
  - `warn` "Apple client secret is not a decodable JWT" if misconfigured.
- The Grafana rule `apple-secret-expiry`
  (`observability/grafana/provisioning/alerting/rules.yml`) counts those warn
  lines over a 3-hour window and **emails the ops contact point** while any
  exist. The warn message string is exported as
  `APPLE_SECRET_EXPIRY_WARNING` and matched verbatim by the rule — change
  them in lockstep or the alert silently disarms.
- With minting active this alert should **never fire**. If it does, either a
  container has somehow run > 5 months without a redeploy (action: redeploy —
  that alone re-mints) or you are on the static fallback (action: set the
  minting trio, or rotate `APPLE_CLIENT_SECRET`).

### Getting the alert to multiple inboxes

The `ops-email` contact point reads the existing `GRAFANA_ALERT_EMAIL`
GitHub secret. Grafana accepts **multiple addresses separated by `;`** in
that field — set the secret's value to all recipients (e.g. the three admin
inboxes) and redeploy. No code change needed. Note this widens recipients for
_all_ Grafana alerts; scope a dedicated contact point + notification policy
in `observability/grafana/provisioning/alerting/` if that's unwanted.

## Ops setup (one-time)

1. In the Apple Developer portal (Certificates → Keys), create — or reuse —
   a **Sign in with Apple** key. Download the `AuthKey_<KEYID>.p8` file and
   note the 10-character Key ID and your 10-character Team ID.
2. Base64-encode the key file: `base64 -i AuthKey_<KEYID>.p8 | pbcopy`
   (single line; the encoding exists because a multi-line PEM cannot survive
   the `KEY=value` env-file format — same convention as
   `CLOUDFRONT_PRIVATE_KEY_BASE64`).
3. Set GitHub repo secrets: `APPLE_TEAM_ID`, `APPLE_KEY_ID`,
   `APPLE_PRIVATE_KEY_BASE64` (plus `APPLE_CLIENT_ID` = the Services ID, and
   optionally `APPLE_APP_BUNDLE_IDENTIFIER`).
4. Deploy. Verify in Grafana logs: one
   `Apple client secret expiry check { source: 'minted', daysRemaining: ~182 }`
   info line at boot.
5. Optionally delete the `APPLE_CLIENT_SECRET` secret once minting is
   verified — it is dead weight afterwards.

## Security notes

- The `.p8` private key lives in the container environment alongside the AWS
  and Stripe keys; its blast radius is limited to minting Sign-in-with-Apple
  client secrets. Revoke it any time in the Apple Developer portal (create a
  replacement key first, swap the three secrets, redeploy).
- A future hardening option: fetch the key from AWS SSM Parameter Store
  (SecureString) at boot instead of env delivery. Rejected for now — it adds
  a boot-time network dependency and diverges from how every other secret in
  this app is delivered.

## Related files

| File                                                    | Role                                                 |
| ------------------------------------------------------- | ---------------------------------------------------- |
| `src/lib/auth/apple-client-secret.ts`                   | Sync ES256 JWT minting (node:crypto)                 |
| `src/lib/auth/social-providers-config.ts`               | `resolveAppleClientSecret()` — mint-first resolution |
| `src/lib/auth/jwt-expiry.ts`                            | Signature-blind `exp` decoder                        |
| `src/lib/auth/apple-secret-expiry-monitor.ts`           | Boot + hourly expiry telemetry                       |
| `src/lib/auth.ts`                                       | Starts the monitor (production runtime only)         |
| `observability/grafana/provisioning/alerting/rules.yml` | `apple-secret-expiry` alert rule                     |
| `docs/auto-generated/better-auth-production-secrets.md` | Full secret inventory                                |
