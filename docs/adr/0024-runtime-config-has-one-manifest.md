# ADR-0024: Runtime configuration has one manifest

- **Status**: Accepted
- **Date**: 2026-11-05

## Context

A configuration name is spelled in four places: a GitHub secret, the
`.env.deploy` heredoc in `roll-host.yml`, the website `environment:` block
in `docker-compose.prod.yml`, and the `process.env` reads in `src/`. Nothing
checked one against another. A name dropped anywhere reached the code as an
empty value, and most code reads "empty" as "feature off" without saying so.

On 2026-11-05 that had happened three times:

- `CLOUDFRONT_DISTRIBUTION_ID` reached only the CI CDN sync, so cover-art
  invalidation never ran.
- `S3_BUCKET` was written to the env file and never passed to the container,
  and the release-image delete read only that name, so it skipped the S3
  delete.
- The Facebook secrets were created as `AUTH_FACEBOOK_*` while the workflow
  read `FACEBOOK_CLIENT_*`. The server skipped Facebook; the sign-in page,
  which hard-coded four buttons, still offered it.

The review also named `STRIPE_WEBHOOK_IP_RANGES`, a secret that never
reached the container, but nothing was broken there. Production Stripe
webhooks go to the `stripe-webhook` Lambda, and the container's webhook
route returns 404 in production.

The required-value check was a hand-written list of 21 names, run lazily from
the root layout through a dynamic import nobody awaited.

## Decision

**`src/lib/config/env-manifest.ts` lists every name `src/` reads, with its
phase and requirement, and everything else is derived from it or checked
against it.**

- **Phase.** `runtime` values travel through the env file and compose;
  `build` values (`NEXT_PUBLIC_*`) are inlined by `next build` and must reach
  the CI build, the Dockerfile and the deploy build args; `local` values are
  never set in production (platform values, dev and E2E switches).
- **Requirement.** `required` runtime values stop the website from booting in
  production. Everything else is `optional`: it has a fallback, or it belongs
  to a **feature group**.
- **Feature groups** name the optional values that only work together (an
  OAuth client id and secret, CloudFront's signing key pair). With none set
  the feature is off by choice; with some set but not enough it is off by
  mistake, which the boot check logs as one error. The server still boots:
  a half-configured login is not worth an outage.
- **The boot check** (`boot-check.ts`) runs in `instrumentation.ts`
  `register()`, before the first request. It logs one line per disabled
  group and never logs a value. `SKIP_ENV_VALIDATION` still skips the
  required check for the Docker build and the E2E servers.
- **Getters** (`runtime-config.ts`, server-only) are how code reads a value
  whose absence switches something off, so "missing" (unset, empty or blank)
  means one thing everywhere. Client code keeps its literal `NEXT_PUBLIC_`
  reads, which Next.js inlines.
- **One list of social providers.** `enabledSocialProviders()` decides both
  what better-auth registers and which buttons the server pages pass to the
  client, as ids. A button never shows for a provider the server skipped.
- **A drift spec** (`scripts/ci/runtime-config-drift.spec.ts`) reads the
  workflows, compose, the Dockerfile and `src/` as text. Every runtime name
  must be in the env file and compose under the same name, read from the
  secret or variable of that name; the env file and compose must list the
  same names apart from a commented infra allow-list; nothing the app does
  not read is forwarded; every build name reaches all three build lists; and
  `src/` reads no name the manifest lacks.

**Intent is stated, not inferred.** The repo cannot see GitHub secret names,
so a secret under the wrong name is indistinguishable from a provider that is
deliberately off. The operator states the intent in the
`ENABLED_SOCIAL_PROVIDERS` repository variable (default
`google,apple,facebook`; `none` for no social login).

**Missing config fails the roll, not the host.** `roll-host.yml` checks, on
the runner and before it touches AWS, the env file or the host, that every
required value is set and every intended provider has its credentials. A
failure turns the run red and production keeps serving the version it runs.
Leaving it to the boot check alone would not: `deploy-remote.sh` stops the
old containers before it starts the new ones, its container-count check can
exit before its health-check rollback runs, and when that rollback does run
it exits 0, so the deploy reads green while the old version serves.
(Amended 2026-11-08: `deploy-remote.sh` now rolls back on every failure
after it stops the old containers and exits non-zero after a successful
rollback, so a bad image fails the run red. The runner-side check still
saves the roll and its downtime.)

## Alternatives rejected

- **Fail boot on a half-set feature group.** It would have turned the
  Facebook mistake into an outage of the whole site.
- **Infer intent from the secrets that exist.** GitHub does not expose
  secret names to a workflow, and the wrong-name case looks exactly like a
  provider that is off.
- **A schema library over `process.env` at module load** (t3-env and the
  like). It moves the check into whichever module loads first, often during
  `next build`, where runtime secrets do not exist; `register()` runs once,
  at server start, never at build.

## Consequences

- Adding an env read means adding a manifest line; the drift spec fails until
  the name is there, and, for a runtime name, until it is forwarded.
- `STRIPE_WEBHOOK_IP_RANGES` is `local`. Production's allowlist lives in
  the Lambda's SSM parameter, which `RefreshIpAllowlistFunction` rewrites
  daily from Stripe's published list. The dev-only route reads the source
  IP only from `X-Real-IP`, never from the client-controlled
  `X-Forwarded-For`.
- A rollback runs the same pre-roll checks with main's manifest, so a missing
  required secret blocks a rollback as well as a forward deploy.
- `AUTH_DISABLE_SIGNUP`, `CONTACT_EMAIL`, `LOG_DEBUG_MODULES` and
  `SLOW_QUERY_MS` were `local` at first. Since 2026-11-08 they are optional
  `runtime` values read from repository variables of the same name; an
  unset variable writes an empty value, which each reader treats exactly as
  unset. Signups could already be paused in production from
  `/admin/settings`; `AUTH_DISABLE_SIGNUP` is the override that the toggle
  cannot undo, and it needs a roll to change. Forwarding any other name is
  the same change: a manifest line plus the env-file and compose lines the
  drift spec asks for.
