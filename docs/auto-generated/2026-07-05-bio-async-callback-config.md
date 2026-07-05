# Bio Async Callback — Configuration

- **Date:** 2026-07-05
- **Status:** Reference (PR 2b, Task B10)
- **Applies to:** `src/lib/services/bio-generation-service.ts`,
  `src/app/api/artists/[id]/bio-generation/callback/route.ts`,
  `src/lib/actions/generate-artist-bio-action.ts`

## What changed

Bio generation is now **fire-and-forget**. The app invokes the `bio-generator`
Lambda with `InvocationType: 'Event'` (AWS returns `202` immediately — there is
no synchronous response body to read). When the Lambda finishes, it **POSTs its
result back** to the app:

```
POST https://<public-origin>/api/artists/<artistId>/bio-generation/callback
Body: { "jobToken": "<per-job uuid>", "result": <BioGenerationResult> }
```

The route verifies the token and answers `202` for the token-check path
regardless of whether the token matches (so it cannot be used to enumerate
jobs) — a `413` for an oversized body or a `400` for a malformed body precedes
that check. It then runs the heavy re-host/persist + cache revalidation
post-response via Next.js `after()`.

## Auth: a per-job capability token — nothing to rotate

Authentication of the callback is a **per-job capability token** (`jobToken`, a
random UUID minted when the job is dispatched, stored on the artist row, and
single-use — atomically claimed on the first matching callback). There is:

- **No SSM parameter** to provision.
- **No GitHub / shared secret** to configure or rotate.
- **Nothing to rotate at all** — each job carries its own throwaway token.

The token is compared in constant time; a missing/in-flight/mismatched token
yields the same `202`, and a concurrent duplicate callback loses the atomic
claim.

## The only new/required config: the public base URL

The single piece of configuration the async path needs is the app's **canonical
public HTTPS origin**, so the AWS-hosted Lambda can reach the app to deliver its
callback. This is read from:

```
NEXT_PUBLIC_BASE_URL   (e.g. https://fakefourrecords.com)
```

`buildBioCallbackUrl(artistId)` derives
`${NEXT_PUBLIC_BASE_URL}/api/artists/${artistId}/bio-generation/callback` from
it (trimming a trailing slash so the path has exactly one separator).

- This is the **same env** every other publicly-reachable absolute link already
  uses (email links, notification URLs) — no new variable was introduced.
- It is **not globally required**: when it is unset, `buildBioCallbackUrl`
  returns `null` and `runGenerationJob` marks the job `failed` (rather than
  dispatching an un-answerable invoke). Because the code already degrades
  gracefully on an unset base URL, it is **not** added to the required-env
  registry in `src/lib/config/env-validation.ts` (whose flat `required` list
  has no per-feature/optional slot) — a hard requirement would add nothing.
  Adding it there would not constrain the fake/E2E path either:
  `validateEnvironment` short-circuits entirely under `SKIP_ENV_VALIDATION`,
  and the `required` list is only enforced under `production`. It must, of
  course, be set in **production** for real generation to complete.

## Related constants & unchanged paths

- **`STALE_JOB_MS = 17 min`** (`generate-artist-bio-action.ts`): a `processing`
  job older than this is treated as stale/reclaimable, so a lost Lambda callback
  cannot wedge the artist in `processing` forever.
- **`BIO_GENERATOR_FAKE=true`** path is **unchanged**: it runs the deterministic
  fixture **synchronously** in-process, sets `succeeded` directly, and fires
  **no Event invoke and no callback**. E2E and local dev are unaffected by the
  async decoupling.
- The admin form surfaces completion via the existing **2.5 s status poll**
  (`use-artist-bio-generation-status-query.ts`).

## First real validation

The first end-to-end validation of the async callback should be a **production
regen** of a single artist, watched through the admin form's 2.5 s poll flipping
`processing → succeeded` (or `failed` with the Lambda's error).
