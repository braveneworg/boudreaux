<!--
This Source Code Form is subject to the terms of the Mozilla Public
License, v. 2.0. If a copy of the MPL was not distributed with this
file, You can obtain one at https://mozilla.org/MPL/2.0/.
-->

# Official Setup Instructions

Branch: `feature/generate-artist-bios-and-update-artist-details` · Base: `main`

A practical guide to getting this branch running **locally** and understanding what
**CI** needs. For the deeper AWS/SAM/IAM deploy details (CloudFront, image variants,
the full Lambda architecture) see the companion doc
[`artist-bios-deployment-and-secrets.md`](./artist-bios-deployment-and-secrets.md);
this guide is the developer-focused, day-to-day version.

> **TL;DR — run it locally with zero AWS:**
>
> ```bash
> nvm use && corepack enable && corepack prepare pnpm@11.15.1 --activate
> pnpm install
> pnpm exec prisma db push
> BIO_GENERATOR_FAKE=true pnpm run dev
> ```
>
> Then open `/admin/artists`, edit an artist, and use **AI Bio Generation**.

---

## 1. What changed on this branch

| Area             | What's new                                                                                                                  | Why it matters for setup                                                  |
| ---------------- | --------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| `bio-generator/` | A standalone AWS SAM Lambda (separate pnpm workspace) that writes bios with Gemini from MusicBrainz/Wikidata/Wikimedia data | New AWS resources + a Gemini key in SSM; deployed by its own workflow     |
| Web app          | Invokes the Lambda via `@aws-sdk/client-lambda`, re-hosts images to S3, renders sanitized HTML                              | New env vars: `BIO_GENERATOR_LAMBDA_NAME`, `BIO_GENERATOR_FAKE`           |
| Editing          | Tiptap rich-text editors for the three bio fields                                                                           | New deps: `@tiptap/*`, `html-react-parser`                                |
| Tests            | A Vitest `forks` project for the `html-react-parser` spec                                                                   | `bio-html.spec.tsx` runs in a different pool; consumers mock `./bio-html` |
| CI/CD            | `deploy-bio-generator.yml` (new), `BIO_GENERATOR_FAKE` in E2E, `BIO_GENERATOR_LAMBDA_NAME` in deploy                        | New GitHub secrets/variables                                              |
| Security         | `.gitleaks.toml` (new) allowlists bio-generator test fixtures                                                               | The pre-commit secret scan reads it automatically                         |

**Good news:** the only external service that needs a real key is **Gemini**.
MusicBrainz, Wikidata, and Wikimedia need no key (just a descriptive `User-Agent`,
already baked in). And you can do all local development with **no AWS at all** using
fake mode.

---

## 2. Toolchain

| Tool                 | Version                 | How                                                                                                                             |
| -------------------- | ----------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| Node.js              | **v24.18.0** (`.nvmrc`) | `nvm use` (or `nvm install`). **Always run this before `pnpm` and `git push`** — the pre-push hook's `tsc` fails on older Node. |
| pnpm                 | **11.15.1**             | `corepack enable && corepack prepare pnpm@11.15.1 --activate`                                                                   |
| Docker               | any recent              | Only for E2E (isolated MongoDB on `localhost:27018`)                                                                            |
| AWS CLI v2 + SAM CLI | latest                  | Only if you deploy the Lambda manually (CI does it for you)                                                                     |

---

## 3. Accounts & secrets you must create

### 3.1 Gemini API key — the only required third-party key

This is only needed to run **real** generation (the Lambda). For local dev you can
skip it entirely and use fake mode (§5).

1. Sign up / sign in: <https://aistudio.google.com>
2. Create a key: <https://aistudio.google.com/apikey> (copied once).
3. Store it in **AWS SSM Parameter Store** as a `SecureString` at the exact path the
   Lambda reads (`/fakefour/gemini/api-key`):
   ```bash
   aws ssm put-parameter \
     --name "/fakefour/gemini/api-key" \
     --type "SecureString" \
     --value "AIza_REPLACE_WITH_YOUR_GEMINI_KEY" \
     --region us-east-1 \
     --overwrite
   ```

> The key lives **only** in SSM — never in `.env`, never committed, never passed to
> the web app. The Lambda fetches and caches it per cold start.

### 3.2 CI/CD: GitHub Actions secrets & variables

Set these under **Repo → Settings → Secrets and variables → Actions**
(<https://github.com/braveneworg/boudreaux/settings/secrets/actions>):

| Name                        | Type         | Used by                    | Purpose                                                                           |
| --------------------------- | ------------ | -------------------------- | --------------------------------------------------------------------------------- |
| `AWS_DEPLOY_ROLE_ARN`       | secret       | `deploy-bio-generator.yml` | IAM role assumed via GitHub OIDC to run `sam deploy`                              |
| `ALERT_EMAIL`               | secret       | `deploy-bio-generator.yml` | SNS subscription for the Lambda error alarm (empty disables it)                   |
| `BIO_GENERATOR_LAMBDA_NAME` | **variable** | `deploy.yml`               | Injected into the app's prod env; falls back to `fakefour-bio-generator` if unset |

The existing app deploy already relies on a long list of secrets (`AWS_ACCESS_KEY_ID`,
`DATABASE_URL`, `S3_BUCKET`, `NEXT_PUBLIC_CDN_DOMAIN`, Stripe/Pusher/email, etc.) — those
are unchanged by this branch.

---

## 4. Local environment variables

This branch adds **two** web-app env vars (now in `.env.example` — copy them into
your local `.env`):

| Variable                    | When you need it             | Notes                                                                                                        |
| --------------------------- | ---------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `BIO_GENERATOR_FAKE`        | Local dev / E2E              | `true` → skip AWS + Gemini entirely and use the deterministic fixture. **Use this for everyday local work.** |
| `BIO_GENERATOR_LAMBDA_NAME` | Only for real Lambda invokes | `fakefour-bio-generator`. **Required by `env-validation.ts`** when env validation runs.                      |

> ⚠️ `BIO_GENERATOR_LAMBDA_NAME` is in the required list in
> `src/lib/config/env-validation.ts`. If you don't want to set it locally, run with
> `SKIP_ENV_VALIDATION=true` (env validation is also skipped automatically in test/E2E).
> `BIO_GENERATOR_FAKE=true` alone does **not** bypass validation.

Real generation also reuses the existing AWS/CDN vars (already in `.env.example`):
`AWS_REGION`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`,
`AWS_S3_BUCKET_NAME` (or `S3_BUCKET`), and `NEXT_PUBLIC_CDN_DOMAIN` (or `CDN_DOMAIN`).

Suggested local `.env` additions:

```bash
# AI bio generation
BIO_GENERATOR_FAKE="true"                       # local dev: no AWS/Gemini
BIO_GENERATOR_LAMBDA_NAME="fakefour-bio-generator"
```

---

## 5. Local setup steps

```bash
# 1. Toolchain
nvm use                                          # Node v24.18.0 from .nvmrc
corepack enable && corepack prepare pnpm@11.15.1 --activate

# 2. Install (postinstall runs `prisma generate`)
pnpm install

# 3. Push the new Prisma fields/models to MongoDB
#    (Artist.bio/shortBio/altBio/bioGeneratedAt/bioModel + ArtistBioImage + ArtistBioLink)
pnpm exec prisma db push

# 4. Run the app in fake mode (no AWS, no Gemini, no S3)
BIO_GENERATOR_FAKE=true pnpm run dev
```

**Exercise the feature:**

1. Go to `/admin/artists` → **edit** an artist (generation needs a persisted artist).
2. Under the **Biography** heading, use **AI Bio Generation** → _Generate bios_.
   In fake mode this returns a deterministic fixture (prose + `picsum.photos` images +
   a Wikipedia link). Review and **Save**.
3. Edit the **bio / short bio / alt bio** rich-text editors (bold, italic, font-size,
   link, insert image) and **Save**.
4. View public output: `/artists`, `/artists/<slug>`, and `/artists/<slug>/bio`.

> In fake mode images come from `picsum.photos` (allow-listed in `next.config.ts`),
> so nothing is written to S3 and no external API is called.

---

## 6. Running tests locally

**App gate** (matches the pre-push hook expectations):

```bash
pnpm run typecheck && pnpm run test:run && pnpm run lint && pnpm run format
```

**Lambda suite** (separate workspace):

```bash
cd bio-generator && pnpm run test:run && cd ..
```

**E2E** (isolated Docker MongoDB; the Playwright web server sets `BIO_GENERATOR_FAKE`):

```bash
pnpm run e2e:docker:up
pnpm exec playwright test e2e/tests/artists e2e/tests/admin-artist-bio-generation.spec.ts
pnpm run e2e:docker:down
```

**Test-pool note (Vitest):** the bio HTML renderer's spec
(`src/app/components/bio-html.spec.tsx`) imports `html-react-parser`, which only loads
correctly under Vitest's **`forks`** pool — `vitest.config.ts` routes it to a dedicated
`jsdom-forks` project (`HTML_PARSER_SPECS`) while everything else stays on the faster
`vmThreads` pool. **If you write a new component that renders `<BioHtml>`, mock it in
that component's spec** (`vi.mock('./bio-html', …)`) so the spec stays on `vmThreads`;
otherwise it crashes at import with an opaque `domhandler` ESM error. See the two
existing examples: `artist-bio-content.spec.tsx`, `artist-detail-content.spec.tsx`.

---

## 7. Git hooks — what blocks a commit / push

These run automatically via Husky:

**pre-commit**

- Blocks committing directly to `main`/`master`.
- `gitleaks protect --staged` — secret scan. It now reads `.gitleaks.toml`, which
  allowlists `bio-generator/src/*.spec.ts` (those tests use a literal `"test-key"`
  placeholder, not a real secret).
- `lint-staged` — `tsc-files` + `eslint --fix` + `prettier` on staged files.
- `vitest --changed` — tests touching your changes.

**pre-push**

- Blocks pushing to `main`/`master`; requires the branch be up to date with
  `origin/main`; rejects `WIP`/`fixup!`/`squash!` commits.
- `pnpm exec tsc --noEmit`, `pnpm run lint`, `pnpm run test:coverage:check`.

> 🟡 **Most common gotcha:** `git push` fails the pre-push `tsc` step with a Node
> version error. The hook inherits whatever Node is on your `PATH`. Run **`nvm use`**
> (Node 24) in the same shell before `git push`. Do **not** use `--no-verify`.

---

## 8. CI overview

Three workflows are relevant:

**`.github/workflows/ci.yml`** — unit + E2E on every PR.

- The E2E job sets `BIO_GENERATOR_FAKE: "true"` and `NEXT_PUBLIC_E2E_MODE: "true"`,
  and runs against the isolated Mongo at `mongodb://localhost:27018/boudreaux-e2e`
  (`SKIP_ENV_VALIDATION: "true"`). So CI exercises the admin bio flow **without** AWS
  or Gemini.

**`.github/workflows/deploy.yml`** — app image build/deploy (push to `main`).

- Injects `BIO_GENERATOR_LAMBDA_NAME=${{ vars.BIO_GENERATOR_LAMBDA_NAME || 'fakefour-bio-generator' }}`
  into the production environment. Set the repo **variable** if your function name differs.
- **Does _not_ run `prisma db push`.** The deploy only builds/runs the app image (the
  Docker build runs `prisma generate` for the client, not a schema push). See
  [Database schema changes](#database-schema-changes-prisma-db-push) below.

### Database schema changes (`prisma db push`)

Schema changes are **not** applied automatically by the deploy — `prisma db push` is a
deliberate, manual step. MongoDB is schemaless, so most edits need nothing in prod:

- **Adding/removing optional scalar fields** (e.g. `Artist.bioStatus`): no push required.
  Existing documents simply read the new field as `null` until it is written.
- **Index changes** (`@@index`, `@unique`, `@@unique`) and new collections/relations
  with indexes: **do** require a push, or the new indexes/constraints won't exist in prod.

When a push is needed, run it once from a machine that can reach the **production** Mongo
(the external `DATABASE_URL`), with that URL scoped to the command — never committed, never
left in your shell:

```bash
# Replace with the production connection string (treat as a secret).
DATABASE_URL='<prod-mongodb-uri>' pnpm exec prisma db push
```

> Review the printed plan before confirming. `prisma db push` can drop indexes to match the
> schema (it prompts for `--accept-data-loss` on destructive changes) — never pass that flag
> blindly against prod. This is intentionally manual so an index drop can't ride in on a
> routine app deploy.

**`.github/workflows/deploy-bio-generator.yml`** — deploys the Lambda (new).

- Triggers on push to `main` touching `bio-generator/**` (or manual `workflow_dispatch`).
- Uses GitHub **OIDC** (`AWS_DEPLOY_ROLE_ARN`) — no static AWS keys — region `us-east-1`,
  Node 24, pnpm.
- Steps: install → `pnpm run test:run` → `sam build` → `sam deploy` to stack
  `fakefour-bio-generator` (SAM artifact bucket `fakefour-sam-artifacts-us-east-1`,
  `AlarmEmail` from the `ALERT_EMAIL` secret) → prints the deployed function name.

**Required CI secrets/variables:** `AWS_DEPLOY_ROLE_ARN` (secret), `ALERT_EMAIL`
(secret), `BIO_GENERATOR_LAMBDA_NAME` (variable). See §3.2.

---

## 9. Deploying the Lambda

**Via CI (recommended):** merge a change under `bio-generator/**` to `main`, or run
`deploy-bio-generator.yml` from the Actions tab (_Run workflow_).

**Manually:**

```bash
cd bio-generator
pnpm install --frozen-lockfile
pnpm run test:run
npm install -g esbuild        # SAM's esbuild bundler
sam build
sam deploy \
  --s3-bucket fakefour-sam-artifacts-us-east-1 --s3-prefix fakefour-bio-generator \
  --stack-name fakefour-bio-generator --region us-east-1 \
  --capabilities CAPABILITY_NAMED_IAM \
  --no-confirm-changeset --no-fail-on-empty-changeset \
  --parameter-overrides Environment=production "AlarmEmail=you@example.com"
cd ..
```

Then read the deployed name and set it as the app's `BIO_GENERATOR_LAMBDA_NAME`
(repo variable for CI, runtime env for the server):

```bash
aws cloudformation describe-stacks \
  --stack-name fakefour-bio-generator --region us-east-1 \
  --query 'Stacks[0].Outputs[?OutputKey==`FunctionName`].OutputValue' --output text
```

---

## 10. Troubleshooting

| Symptom                                                                  | Cause                                          | Fix                                                                                                    |
| ------------------------------------------------------------------------ | ---------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| App: `Bio generator is not configured (BIO_GENERATOR_LAMBDA_NAME unset)` | Real invoke without the env var                | Set `BIO_GENERATOR_LAMBDA_NAME=fakefour-bio-generator`, or use `BIO_GENERATOR_FAKE=true` for local dev |
| Startup: env validation fails on `BIO_GENERATOR_LAMBDA_NAME`             | It's a required var                            | Add it to `.env`, or run with `SKIP_ENV_VALIDATION=true`                                               |
| Lambda: `SSM parameter /fakefour/gemini/api-key returned no value`       | Gemini key not stored / wrong region           | Re-run the `aws ssm put-parameter` in `us-east-1` (§3.1)                                               |
| `git push` fails on `tsc` with a Node version error                      | Hook ran under the wrong Node                  | `nvm use` (Node 24) before `git push` — never `--no-verify`                                            |
| gitleaks blocks a commit on a `bio-generator` test                       | False positive on a placeholder key            | Already handled by `.gitleaks.toml`; add new fixture paths there if needed                             |
| Spec crashes at import with a `domhandler` ESM error                     | A new `<BioHtml>` consumer spec on `vmThreads` | `vi.mock('./bio-html', …)` in that spec (see §6)                                                       |
| E2E unexpectedly hits real AWS/Gemini                                    | Fake mode not set                              | Ensure `BIO_GENERATOR_FAKE=true` (the Playwright web server sets it; CI sets it in `ci.yml`)           |
| Bio image 403s on the CDN                                                | Requested width has no `_w{width}` variant     | Confirm `images.imageSizes`/`deviceSizes` in `next.config.ts` match `IMAGE_VARIANT_DEVICE_SIZES`       |
