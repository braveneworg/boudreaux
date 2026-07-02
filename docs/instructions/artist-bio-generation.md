<!--
This Source Code Form is subject to the terms of the Mozilla Public
License, v. 2.0. If a copy of the MPL was not distributed with this
file, You can obtain one at https://mozilla.org/MPL/2.0/.
-->

# AI Artist Bio Generation & Artist Detail Refresh

|                 |                                                                                                                    |
| --------------- | ------------------------------------------------------------------------------------------------------------------ |
| **Feature**     | AI-generated artist bios (short + long), discovered images/links, public artists index, and a rich-text bio editor |
| **Branch**      | `feature/generate-artist-bios-and-update-artist-details`                                                           |
| **Base branch** | `main`                                                                                                             |
| **Status**      | Uncommitted working-tree changes (no commits on the branch yet)                                                    |

## Summary

This branch adds an end-to-end **AI artist-bio pipeline**. An admin opens the artist edit
form, optionally supplies reference links and a description, and clicks **Generate bios**. A
Server Action invokes a standalone **`fakefour-bio-generator` AWS Lambda** (a separate SAM
project under [`bio-generator/`](../../bio-generator)) that grounds an LLM on free public
music databases — **MusicBrainz → Wikidata → Wikimedia Commons → Gemini** — and returns a
short bio, a long HTML bio, genres, and _real_ (never LLM-invented) image and link URLs. The
web app sanitizes everything, **re-hosts the discovered images into our own S3/CDN** with
`sharp` width variants, and persists the result (bios + `ArtistBioImage` / `ArtistBioLink`
rows) in a single transaction.

On the public side it adds an **`/artists` index** (cards with short bio + primary images), a
full **`/artists/[slug]/bio`** page, and a `BioHtml` renderer that maps sanitized bio HTML onto
Next.js `<Image>`/`<Link>` primitives. Bio fields are now authored in a **Tiptap rich-text
editor** rather than a plain textarea.

> The Lambda has its own focused guide at
> [`docs/auto-generated/bio-generator-lambda.md`](../auto-generated/bio-generator-lambda.md).
> This document covers the **whole feature** — web app + Lambda + infra — and how to run it.

---

## Change inventory

### Standalone Lambda — `bio-generator/` (new SAM project, separate pnpm workspace)

| File                                                                                                       | Purpose                                                                                                                                 |
| ---------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| `template.yaml`                                                                                            | SAM template: `BioGeneratorFunction` (Node 24, arm64, 29s/512MB), SSM/KMS read policy, error CloudWatch alarm + SNS topic               |
| `src/handler.ts`                                                                                           | Orchestrates MusicBrainz → Wikidata → Wikimedia → Gemini; graceful prose-only degradation; returns discriminated `{ ok, ... }` envelope |
| `src/musicbrainz.ts`                                                                                       | Resolve artist by name → Wikidata id + external relations                                                                               |
| `src/wikidata.ts`                                                                                          | Read `P18` image file names, `P856` official site, English Wikipedia sitelink                                                           |
| `src/wikimedia.ts`                                                                                         | Resolve Commons file names to hotlinkable URLs + attribution/license                                                                    |
| `src/gemini.ts`                                                                                            | Write short/long bio prose in JSON mode, grounded on the gathered facts                                                                 |
| `src/types.ts`                                                                                             | **Contract**: request/response Zod schemas + `USER_AGENT`, `DEFAULT_GEMINI_MODEL`                                                       |
| `src/lib/secrets.ts`                                                                                       | Read the Gemini API key from SSM Parameter Store at runtime                                                                             |
| `events/sample.json`                                                                                       | Sample event for `sam local invoke`                                                                                                     |
| `package.json`, `tsconfig.json`, `vitest.config.ts`, `pnpm-workspace.yaml`, `pnpm-lock.yaml`, `.gitignore` | Workspace scaffold (mirrors `stripe-webhook/`)                                                                                          |
| `src/*.spec.ts`                                                                                            | Unit tests — all `fetch`/SSM mocked, deterministic & offline                                                                            |

### Data layer

| File                                        | Purpose                                                                                                                         |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `prisma/schema.prisma`                      | New `ArtistBioImage` & `ArtistBioLink` models; new `Artist.bioGeneratedAt`, `Artist.bioModel`; `bioImages`/`bioLinks` relations |
| `src/lib/types/media-models.ts`             | Add `bioImages`/`bioLinks` to `artistWithPublishedReleasesInclude`; new `artistListWithBioInclude` + `ArtistListWithBio` type   |
| `src/lib/validation/media-models-schema.ts` | Zod scalar schemas for the two new models + new artist fields                                                                   |
| `src/lib/repositories/artist-repository.ts` | `listPublishedWithBio()` (public index) and `replaceBioContent()` (transactional bio replace)                                   |

### Services / actions / validation

| File                                                | Purpose                                                                                                          |
| --------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `src/lib/services/bio-generation-service.ts`        | **New.** Owns the read → invoke → sanitize → re-host → persist flow; Lambda/fixture seam                         |
| `src/lib/services/bio-generation-fixture.ts`        | **New.** Deterministic `fakeBioGeneration` used when `BIO_GENERATOR_FAKE=true`                                   |
| `src/lib/services/bio-image-service.ts`             | **New.** `rehostWithVariants()` — fetch external image, upload to S3, build `_w{width}` variants, return CDN URL |
| `src/lib/services/artist-service.ts`                | Sanitize bio fields on write/read; new `listPublishedArtists()`                                                  |
| `src/lib/actions/generate-artist-bio-action.ts`     | **New.** Admin-only Server Action: auth + Zod + audit log + `revalidatePath`                                     |
| `src/lib/validation/bio-generation-schema.ts`       | **New.** Web-side mirror of the Lambda contract + `GeneratedBioContent`                                          |
| `src/lib/utils/sanitize-bio-html.ts`                | **New.** `sanitizeBioHtml` (allowlist + link hardening) / `sanitizeBioText` (strip tags)                         |
| `src/lib/utils/image-variants.ts`                   | **New.** `generateVariantsFromBuffer()` extracted for reuse by bio re-hosting                                    |
| `src/lib/actions/generate-image-variants-action.ts` | Refactored to use the shared `image-variants` util                                                               |

### Client hooks & components

| File                                                                 | Purpose                                                                                      |
| -------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| `src/app/hooks/mutations/use-bio-mutations.ts`                       | **New.** `useGenerateArtistBioMutation` — wraps the action, invalidates artist caches        |
| `src/app/artists/page.tsx`                                           | **New.** Public `/artists` index (Server Component)                                          |
| `src/app/artists/[slug]/bio/page.tsx`                                | **New.** Full bio page (`/artists/[slug]/bio`), SSR-prefetched + hydrated                    |
| `src/app/artists/[slug]/page.tsx`                                    | Artist detail page (wired to new content)                                                    |
| `src/app/components/artist-list-card.tsx`                            | **New.** Index card: short bio + primary images                                              |
| `src/app/components/artist-bio-content.tsx`                          | **New.** Client bio page content                                                             |
| `src/app/components/artist-detail-content.tsx`                       | Detail content — renders bio via `BioHtml`, images via `ExpandableThumbnail`                 |
| `src/app/components/bio-html.tsx`                                    | **New.** Maps sanitized bio HTML → `next/Image` + `next/Link` (no `dangerouslySetInnerHTML`) |
| `src/app/components/expandable-thumbnail.tsx`                        | **New.** Click-to-expand bio image thumbnail                                                 |
| `src/app/components/release-combobox.tsx`                            | **New.** Release picker used by the artist player                                            |
| `src/app/components/artist-player.tsx`                               | Player updates; consumes `ReleaseCombobox`                                                   |
| `src/app/components/forms/artist-bio-generation-section.tsx`         | **New.** Admin "AI Bio Generation" panel (links/description input, preview, regenerate)      |
| `src/app/components/forms/artist-form.tsx`                           | Wires in the bio section + lazy Tiptap `RichTextEditor` for bio fields                       |
| `src/app/components/ui/rich-text-editor.tsx`                         | **New.** Tiptap editor primitive (dynamic, `ssr:false`)                                      |
| `src/app/admin/components/admin-nav.tsx`, `src/app/admin/layout.tsx` | Admin nav horizontal-scroll arrows (incidental UX)                                           |

### Config / infra

| File                                         | Purpose                                                                                                |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| `next.config.ts`                             | Allow `upload.wikimedia.org` / `commons.wikimedia.org` remote images                                   |
| `src/lib/config/env-validation.ts`           | Require `BIO_GENERATOR_LAMBDA_NAME`                                                                    |
| `package.json`                               | Add `@aws-sdk/client-lambda`, `@tiptap/*`, `html-react-parser`                                         |
| `vitest.config.ts`                           | Exclude `bio-generator/**` from the app suite; new `jsdom-forks` project for `html-react-parser` specs |
| `.github/workflows/deploy-bio-generator.yml` | **New.** OIDC + `sam build`/`sam deploy`, triggered on `bio-generator/**`                              |
| `.github/workflows/ci.yml`                   | Set `BIO_GENERATOR_FAKE=true` for E2E                                                                  |
| `.github/workflows/deploy.yml`               | Pass `BIO_GENERATOR_LAMBDA_NAME` to the app build                                                      |
| `playwright.config.ts`                       | Set `BIO_GENERATOR_FAKE=true` for the E2E web server                                                   |

### Tests

| File                                            | Purpose                                                                   |
| ----------------------------------------------- | ------------------------------------------------------------------------- |
| `e2e/tests/admin-artist-bio-generation.spec.ts` | **New.** Admin generate → regenerate → edit → save flow                   |
| `e2e/tests/artists/artist-page.spec.ts`         | Public bio rendering coverage                                             |
| `e2e/helpers/seed-test-db.ts`                   | Seed bio fields + a `bioImages`/`bioLinks` row; clean them before artists |
| `*.spec.ts(x)` across services/components       | Unit coverage for every new module                                        |

### Docs

| File                                          | Purpose                        |
| --------------------------------------------- | ------------------------------ |
| `docs/auto-generated/bio-generator-lambda.md` | Lambda-focused guide           |
| `docs/instructions/artist-bio-generation.md`  | This guide + rendered diagrams |

---

## Prerequisites

**Web app** (repo root):

- **Node** `v24.14.1` (from `.nvmrc` — use `nvm use`, never a global install)
- **pnpm** `11.x` (via `corepack`)
- **MongoDB** with a replica set (Prisma transactions in `replaceBioContent` require it)
- AWS account/credentials only for **real** generation (S3 re-hosting + Lambda invoke). Local
  dev and E2E run fully offline with `BIO_GENERATOR_FAKE=true`.

**Lambda** (`bio-generator/`):

- Node 24, pnpm 11 (separate workspace)
- **AWS SAM CLI** + Docker (for `sam build` / `sam local invoke`)
- **Gemini API key** stored in SSM (`/fakefour/gemini/api-key`) — free tier
- AWS deploy role assumed via OIDC in CI (`AWS_DEPLOY_ROLE_ARN`)

---

## Environment setup

### Web app env vars

| Var                                 | Purpose                                                                                | Where read                                                                                |
| ----------------------------------- | -------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| `BIO_GENERATOR_LAMBDA_NAME`         | Function name to invoke (default `fakefour-bio-generator`)                             | `BioGenerationService.generate`; validated by `env-validation.ts` in production boot only |
| `BIO_GENERATOR_FAKE`                | `true` → use the deterministic fixture instead of the Lambda; also skips S3 re-hosting | `BioGenerationService.generate`, `BioImageService.shouldSkipRehost`                       |
| `AWS_REGION`                        | Lambda client region (defaults to `us-east-1`)                                         | `BioGenerationService`                                                                    |
| `E2E_MODE` / `NEXT_PUBLIC_E2E_MODE` | Also short-circuit image re-hosting                                                    | `BioImageService.shouldSkipRehost`                                                        |
| existing `AWS_*`, S3, CDN vars      | Image re-hosting (S3 put + variants + CDN URL)                                         | `BioImageService` via `s3-client` / `cdn-url`                                             |

`deploy.yml` injects `BIO_GENERATOR_LAMBDA_NAME=${{ vars.BIO_GENERATOR_LAMBDA_NAME || 'fakefour-bio-generator' }}`.
For local dev, add `BIO_GENERATOR_FAKE=true` to `.env.local` to avoid AWS entirely.

> Per repo policy, never read, print, or commit any `.env*` file. Use placeholders.

### Lambda config (no app/CI secret)

| Where                  | Name                                     | Purpose                                       |
| ---------------------- | ---------------------------------------- | --------------------------------------------- |
| AWS SSM (SecureString) | `/fakefour/gemini/api-key`               | Gemini key — **Lambda-only**, read at runtime |
| Web app IAM identity   | `lambda:InvokeFunction` on the function  | Lets the app invoke it                        |
| Code constant          | `DEFAULT_GEMINI_MODEL` (`src/types.ts`)  | Prose model (`gemini-2.5-flash`)              |
| SAM param              | `AlarmEmail` (CI: `secrets.ALERT_EMAIL`) | Error-alarm SNS subscription                  |

---

## Setup steps

```bash
# --- Web app (repo root) ---
nvm use                       # Node 24.14.1 from .nvmrc
corepack enable
pnpm install                  # pulls @aws-sdk/client-lambda, @tiptap/*, html-react-parser
pnpm exec prisma generate     # regenerate client for the new models/fields
pnpm exec prisma db push      # push ArtistBioImage / ArtistBioLink + Artist fields to MongoDB
pnpm run seed                 # optional: seed dev data

# Add to .env.local for offline generation (recommended for dev):
#   BIO_GENERATOR_FAKE=true

pnpm run dev                  # http://localhost:3000
```

```bash
# --- Lambda (only needed to deploy / run REAL generation) ---
cd bio-generator
pnpm install
pnpm run test:run             # offline unit tests

# One-time: store the Gemini key
aws ssm put-parameter --name /fakefour/gemini/api-key \
  --type SecureString --value "<YOUR_GEMINI_API_KEY>" --overwrite

sam build
sam deploy --guided           # first deploy; note the FunctionName output
# → set BIO_GENERATOR_LAMBDA_NAME in the app env to that name
```

---

## Run / reproduce

### Admin: generate a bio (UI entry point)

1. Sign in as an **admin** and open an existing artist's edit form
   (`/admin/artists/[artistId]`, which renders `ArtistForm` → "AI Bio Generation" panel).
   The panel is **edit-mode only** — a new artist must be created/saved first so it has an id.
2. _(Optional)_ Add reference links (must start with `http(s)://`) and a description (≤2000 chars).
3. Click **Generate bios**. With `BIO_GENERATOR_FAKE=true` this returns the deterministic
   fixture instantly; otherwise it invokes the Lambda.
4. Review the preview — short bio, **starred** primary images, discovered links. Click
   **Regenerate bios** to replace, or **Save** the form to keep the result. Generation also
   writes immediately via `replaceBioContent` and `revalidatePath`s `/admin/artists`,
   `/artists`, `/artists/[slug]`, `/artists/[slug]/bio`.

### Public surfaces

- `GET /artists` — index of published artists (`ArtistService.listPublishedArtists`, primary
  images only, ordered by display name).
- `GET /artists/[slug]` — detail page; bio rendered through `BioHtml`.
- `GET /artists/[slug]/bio` — full bio page (SSR-prefetched, shares the by-slug query key).

### Lambda directly

```bash
cd bio-generator
sam build
sam local invoke BioGeneratorFunction -e events/sample.json   # needs Gemini key reachable via SSM
```

Expected envelope:

```jsonc
{
  "ok": true,
  "data": {
    "shortBio": "...",
    "longBio": "<p>...</p>",
    "genres": "...",
    "images": [{ "url": "...", "attribution": "...", "isPrimary": true }],
    "links": [{ "label": "Wikipedia", "url": "...", "kind": "wikipedia" }],
    "model": "gemini-2.5-flash",
  },
}
```

---

## Verification

```bash
# Web app gate (run all four before committing)
pnpm run typecheck && pnpm run test:run && pnpm run lint && pnpm run format

# Targeted unit specs for this feature
pnpm exec vitest run \
  src/lib/services/bio-generation-service.spec.ts \
  src/lib/services/bio-image-service.spec.ts \
  src/lib/actions/generate-artist-bio-action.spec.ts \
  src/lib/utils/sanitize-bio-html.spec.ts \
  src/app/components/bio-html.spec.tsx \
  src/app/components/forms/artist-bio-generation-section.spec.tsx

# Lambda specs
cd bio-generator && pnpm run test:run
```

```bash
# E2E (isolated Docker Mongo on :27018; BIO_GENERATOR_FAKE=true is set by playwright.config)
pnpm run e2e:docker:up
pnpm run test:e2e -- admin-artist-bio-generation
pnpm run test:e2e -- artists/artist-page
pnpm run e2e:docker:down
```

**What passing looks like**

- Admin spec drives generate → regenerate → edit → save without hitting AWS (fixture).
- The seeded `e2e-artist` bio page renders an inline `<a>` (as a `nofollow` Next `Link`) and a
  CDN `<img>` (as a Next `Image` with `_w{width}` srcset), exercising `BioHtml` end-to-end.
- `bio-html.spec.tsx` runs under the dedicated **`jsdom-forks`** Vitest project (so
  `html-react-parser`'s aliasing works) — confirm it isn't silently excluded.

> **E2E DB isolation is mandatory.** Only ever run E2E against
> `mongodb://localhost:27018/boudreaux-e2e?replicaSet=rs0`. If results look empty or a page
> 404s, suspect the wrong database first — stop and check, don't retry blindly.

---

## Teardown

```bash
# Stop E2E Mongo + volumes
pnpm run e2e:docker:down

# Drop seeded/generated bio data (dev DB)
pnpm exec prisma studio   # delete ArtistBioImage / ArtistBioLink rows; null out
                          # Artist.bio/shortBio/bioGeneratedAt/bioModel as needed

# Remove rendered diagram artifacts if regenerating
rm docs/instructions/artist-bios-*.pdf

# Tear down the Lambda stack entirely (removes function, alarm, SNS topic)
cd bio-generator && sam delete --stack-name fakefour-bio-generator --region us-east-1
# (Optionally) remove the SSM key:
aws ssm delete-parameter --name /fakefour/gemini/api-key
```

Re-hosted S3 objects live under `media/artists/{artistId}/bio/…` — delete that prefix to
reclaim storage. Revert env by unsetting `BIO_GENERATOR_FAKE` / `BIO_GENERATOR_LAMBDA_NAME`.

---

## Architecture

### Component & data flow

The web app and the Lambda are **separate deployables** that share only a Zod contract
(`bio-generator/src/types.ts` ↔ `src/lib/validation/bio-generation-schema.ts`, kept in
lockstep by hand). The app invokes the Lambda directly over the AWS SDK
(`@aws-sdk/client-lambda`) — there is **no HTTP endpoint**. A single env flag
(`BIO_GENERATOR_FAKE`) swaps the Lambda for an in-process fixture and disables S3 re-hosting,
which is what makes the whole flow runnable offline in dev and CI.

![Architecture](./artist-bios-architecture.pdf) — source: [`artist-bios-architecture.mmd`](./artist-bios-architecture.mmd)

Key boundaries:

- **`generateArtistBioAction`** (Server Action, admin-only) does auth + Zod + audit logging +
  `revalidatePath`, then delegates all business logic to the service.
- **`BioGenerationService.generateForArtist`** reads the artist, derives the grounding names
  (skips real name when pseudonymous), invokes generation, sanitizes prose, re-hosts images
  best-effort (a failed image is dropped, not fatal), caps primaries at 3, and persists.
- **`BioImageService.rehostWithVariants`** fetches each external image, rejects non-images and
  > 50MB payloads, uploads to S3 under `media/artists/{artistId}/bio/…`, builds width variants
  > via `generateVariantsFromBuffer`, and returns a **CDN** URL — so nothing is hotlinked.
- **`ArtistRepository.replaceBioContent`** runs a `$transaction` that deletes old
  images/links, then updates the artist and recreates rows — regeneration never leaves stale
  data.
- **Sanitization is defense-in-depth**: AI bios are sanitized on _write_; `ArtistService`
  also sanitizes on _read_ (`sanitizeBioHtml` for HTML surfaces, `sanitizeBioText` for
  plain-text like meta descriptions and list cards), so any stored markup is safe to redisplay.
- **`BioHtml`** renders sanitized HTML by mapping `<a>`→`next/Link` (`nofollow noopener
noreferrer`, `target=_blank`) and `<img>`→`next/Image` (CDN loader + `srcset`), avoiding
  `dangerouslySetInnerHTML`.

### Generation sequence

![Generation sequence](./artist-bios-sequence.pdf) — source: [`artist-bios-sequence.mmd`](./artist-bios-sequence.mmd)

### Data model

Two new collections hang off `Artist`. They are **kept separate from the curated
`urls`/`artistUrls` and uploaded `images`** so AI regeneration never clobbers hand-entered
data. `Artist.bioGeneratedAt` (null = hand-authored only) and `Artist.bioModel` record
provenance.

![Bio data model](./artist-bios-erd.pdf) — source: [`artist-bios-erd.mmd`](./artist-bios-erd.mmd)

### Why the LLM never invents URLs

The Lambda gathers facts from MusicBrainz/Wikidata/Wikimedia first, then asks Gemini only to
write prose and _rank_ which gathered images best identify the artist. Image/link URLs come
exclusively from the real sources — which is why generated bios don't 404.

---

## Troubleshooting

| Symptom                                                               | Likely cause / fix                                                                                                                                                                                                 |
| --------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `"Bio generator is not configured (BIO_GENERATOR_LAMBDA_NAME unset)"` | Set `BIO_GENERATOR_LAMBDA_NAME`, or set `BIO_GENERATOR_FAKE=true` for offline dev                                                                                                                                  |
| Env validation fails on boot                                          | `BIO_GENERATOR_LAMBDA_NAME` is now in `env-validation.ts`'s required list, enforced only when `NODE_ENV=production` and skipped during the build phase or with `SKIP_ENV_VALIDATION=true`; local dev is unaffected |
| `"Failed to reach the bio generator"` / `"Bio generation failed"`     | App can't invoke the Lambda — check `lambda:InvokeFunction` IAM, `AWS_REGION`, and the function name; check the CloudWatch error alarm                                                                             |
| `"Bio generation returned an unexpected response"`                    | Lambda payload failed Zod validation — the two contracts drifted; re-sync `bio-generator/src/types.ts` and `bio-generation-schema.ts`                                                                              |
| Discovered images silently missing                                    | Re-host is best-effort; a fetch failure, non-image content-type, or >50MB source drops that image (logged as a warn)                                                                                               |
| Next.js image error for `upload.wikimedia.org`                        | Only relevant before re-hosting/in fixture mode — ensure the Wikimedia `remotePatterns` (added to `next.config.ts`) are present                                                                                    |
| `bio-html.spec.tsx` crashes with a `domhandler`/ESM error             | It must run under the `jsdom-forks` Vitest project (see `vitest.config.ts`); the default `vmThreads` pool ignores `server.deps.inline`                                                                             |
| Prisma transaction error on `replaceBioContent`                       | MongoDB must be a **replica set** — transactions are unsupported on a standalone server                                                                                                                            |
| E2E generation hits AWS / is non-deterministic                        | `BIO_GENERATOR_FAKE=true` must be set (it is, in `playwright.config.ts` and `ci.yml`)                                                                                                                              |
| Empty `/artists` / "artist not found" in E2E                          | Wrong database — confirm `localhost:27018`; do **not** retry against another DB                                                                                                                                    |

---

### Regenerating the diagrams

```bash
# Headless Chrome is required. If mermaid-cli can't find it:
pnpm dlx puppeteer browsers install chrome-headless-shell
# then point a puppeteer config at the installed binary and render each .mmd:
pnpm dlx @mermaid-js/mermaid-cli -p <puppeteer.json> \
  -i docs/instructions/artist-bios-architecture.mmd \
  -o docs/instructions/artist-bios-architecture.pdf -b transparent
# (repeat for -sequence and -erd)
```
