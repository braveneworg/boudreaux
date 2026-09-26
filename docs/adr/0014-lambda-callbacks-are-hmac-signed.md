# ADR-0014: Lambda callbacks are HMAC-signed with a derived per-job key

- **Status**: Accepted
- **Date**: 2026-09-26

## Context

The bio-generator Lambda finishes every async job (bio generation,
images-from-links, video enrichment) by POSTing to a public callback route,
and reports progress to a public progress route. Until now those routes
authenticated the Lambda with one thing: the per-job bearer token
(`bioJobToken`, `imageLinksJobToken`, `enrichmentJobToken`) stored on the
entity row and echoed in the JSON body.

Issue #765 found that `GET /api/artists/slug/[slug]` returned the whole Artist
row — including `bioJobToken` while a job was running — from v4.183.0
(2026-07-05, when the token was introduced) until #785 projected the public
select. `imageLinksJobToken` was exposed the same way from v4.352.0. Anyone
polling the slug endpoint during a job could have forged the completion
callback and written arbitrary bio HTML, images, or links (#787).

The bearer token has a structural weakness: the credential the verifier
holds is the credential the caller presents, so any read of the row — a
projection bug, a backup, a log line — is a forgery kit. #785 closes this
leak; this ADR closes the class.

Options considered:

1. **Keep the bearer token, rely on #785.** Nothing structural changes; the
   next over-wide select re-opens it.
2. **Shared secret in the Lambda via SSM**, HMAC over the body. Sound, but
   adds an SSM parameter, an IAM grant, a rotation procedure that must be
   coordinated across two deploy pipelines, and a second secret to leak.
3. **Per-job key derived from an app-only secret, passed in the invoke
   payload.** The Lambda holds nothing at rest; the app stores nothing new.

## Decision

**Every callback and progress POST is signed, and the signing key is derived
per job from an app-only secret and never stored.**

- The app holds `JOB_CALLBACK_SECRET` (≥ 32 chars; required by env
  validation in production, with the same length floor as `AUTH_SECRET`).
- At dispatch the app derives
  `signingKey = HMAC-SHA256(JOB_CALLBACK_SECRET, "<kind>:<entityId>:<jobToken>")`
  and puts it in the Lambda invoke payload as `signingKey`. The invoke is an
  IAM-authenticated, private channel; the key is never written to the
  database or to logs.
- The Lambda signs each POST with
  `x-job-signature: t=<unix seconds>,v1=<hex HMAC-SHA256(signingKey, "<t>.<rawBody>")>`,
  over the exact bytes it sends, re-signing on every retry so a delayed
  redelivery stays inside the replay window.
- The route hands the header and the raw body to the service. The service
  loads the stored token, **re-derives the key from the stored token**,
  verifies the signature (constant-time, ±5 minutes), and only then runs the
  existing constant-time token compare and the atomic claim. The order
  matters: the signature check happens before anything the caller's body can
  influence, and the token stays as defence in depth.
- On failure the callback routes keep their anti-enumeration `202` and
  schedule no work; the progress routes write nothing. A `warn` names the
  job kind, entity, and reason (`missing | malformed | stale | mismatch |
unconfigured`) and never the signature or key.
- The fake dispatch paths (`BIO_GENERATOR_FAKE=true`) sign with the same
  code, so E2E and local dev exercise the real verification.
- The primitives live in `@fakefour/job-contract/signing`, a **server-only
  subpath export**: it reaches `node:crypto`, and the package root is
  re-exported through `src/lib/validation/*`, which client bundles import.

With this scheme a leaked row gives an attacker the token but not the key,
and the key cannot be derived without the app secret.

## Consequences

- **Rollout.** Merging to `main` deploys the Lambda (SAM) and the app
  (Docker) independently. If the Lambda lands first it signs whenever
  `signingKey` is present and posts unsigned for events that lack it; the old
  app ignores the header. If the app lands first, jobs already in flight post
  unsigned, are rejected, and fall to the existing stale-job timeout — an
  admin re-runs them. Neither order breaks.
- **The secret must exist before the app deploys.** `JOB_CALLBACK_SECRET`
  is required, so the GitHub secret (and the local `.env`) must be set before
  merge or production fails env validation at boot.
- **Rotation** is one secret in one place. In-flight jobs at rotation time are
  rejected and time out; there is no coordinated Lambda change.
- **Content written during the exposure window stays untrusted by
  construction** (#787 steps 1–3): `scripts/list-callback-exposure.ts` lists
  the artists whose callbacks completed in the window for admin review.
