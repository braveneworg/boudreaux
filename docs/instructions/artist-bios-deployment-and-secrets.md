<!--
This Source Code Form is subject to the terms of the Mozilla Public
License, v. 2.0. If a copy of the MPL was not distributed with this
file, You can obtain one at https://mozilla.org/MPL/2.0/.
-->

# AI Artist Bios — Deployment, Secrets & Configuration Guide

|                   |                                                                       |
| ----------------- | --------------------------------------------------------------------- |
| **Feature**       | AI artist-bio generation + rich-text bio editing                      |
| **Branch**        | `feature/generate-artist-bios-and-update-artist-details`              |
| **Base**          | `main` · PR [#509](https://github.com/braveneworg/boudreaux/pull/509) |
| **Setup diagram** | [`artist-bios-setup.pdf`](./artist-bios-setup.pdf)                    |

## 1. Summary

This feature adds a standalone **AWS Lambda** (`bio-generator/`, deployed with AWS SAM) that
writes grounded artist bios with **Gemini**, sourcing facts/images/links from **MusicBrainz**,
**Wikidata**, and **Wikimedia Commons**. The Next.js web app invokes the Lambda directly over
the AWS SDK (not HTTP), **re-hosts discovered images into S3** with the existing `sharp`
width-variant pipeline, serves them from **CloudFront**, and renders the sanitized bio HTML with
Next.js `Link`/`Image`. Admins generate and edit bios from the artist form; the public sees them
on `/artists`, `/artists/[slug]`, and `/artists/[slug]/bio`.

The Lambda grounds the model on real source material — the **full Wikipedia article body**, enriched
MusicBrainz facts, and (when configured) **always-on Jina web-search context** — so bios read as
extensive, original, image-rich, section-structured articles. The web-search context is merged with
the Wikipedia body for every artist (not just a fallback), and also covers artists absent from
MusicBrainz/Wikipedia.

This guide focuses on **what you must sign up for, which secrets/keys to create, and the exact
commands to configure them** so the feature works against your deployed app. Only **one external
paid/keyed service is required: Gemini.** The **Jina** web-search key is optional (web-search context
is skipped when it is unset). MusicBrainz/Wikidata/Wikimedia need no API key (only a descriptive
`User-Agent`, already set).

---

## 2. Change inventory

| Area            | Path                                                                                               | Purpose                                                                                 |
| --------------- | -------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| Lambda          | `bio-generator/src/handler.ts`                                                                     | Orchestrates lookup → prose → assemble; returns a result envelope                       |
| Lambda          | `bio-generator/src/{musicbrainz,wikidata,wikimedia,wikipedia,gemini}.ts`                           | External source clients (no keys except Gemini); `wikipedia.ts` pulls the article body  |
| Lambda          | `bio-generator/src/jina.ts`                                                                        | Optional always-on Jina web-search context (merged with the Wikipedia body)             |
| Lambda          | `bio-generator/src/lib/secrets.ts`                                                                 | Reads Gemini key + optional search key from SSM (`SSM_PATH_GEMINI_API_KEY` / `_JINA_`)  |
| Lambda          | `bio-generator/template.yaml`                                                                      | SAM stack: function, IAM (SSM/KMS), CloudWatch alarm, SNS                               |
| CI/CD           | `.github/workflows/deploy-bio-generator.yml`                                                       | OIDC → `sam build`/`sam deploy` on `bio-generator/**` changes                           |
| App service     | `src/lib/services/bio-generation-service.ts`                                                       | Invokes the Lambda; fake mode; persists via repository                                  |
| App service     | `src/lib/services/bio-image-service.ts`                                                            | Fetches → S3 `PutObject` → variants → CDN URL                                           |
| App util        | `src/lib/utils/image-variants.ts`                                                                  | `sharp` resize → `_w{width}` (+ `.webp`) variants to S3                                 |
| App action/hook | `src/lib/actions/generate-artist-bio-action.ts`, `src/app/hooks/mutations/use-bio-mutations.ts`    | Admin-gated Server Action + mutation hook                                               |
| Rendering       | `src/app/components/{bio-html,artist-bio-content,artist-list-card}.tsx`, `ui/rich-text-editor.tsx` | Tiptap editor + Next `Link`/`Image` rendering                                           |
| Data            | `prisma/schema.prisma`                                                                             | `Artist.bio/shortBio/altBio/bioGeneratedAt/bioModel`, `ArtistBioImage`, `ArtistBioLink` |
| Config          | `next.config.ts`                                                                                   | `images.remotePatterns` for CDN + Wikimedia/picsum                                      |
| Config          | `src/lib/config/env-validation.ts`                                                                 | Requires `BIO_GENERATOR_LAMBDA_NAME`                                                    |

---

## 3. Prerequisites

| Requirement    | Version / Source                                                                                                            |
| -------------- | --------------------------------------------------------------------------------------------------------------------------- |
| Node.js        | **24** (`.nvmrc`; the web app's pre-push hook and the Lambda runtime both need 24 — `nvm use` before any `pnpm`/`git push`) |
| pnpm           | **11.3.0** (`corepack prepare pnpm@11.3.0 --activate`)                                                                      |
| AWS account    | S3, CloudFront, Lambda, SSM Parameter Store, IAM/OIDC, CloudWatch/SNS                                                       |
| AWS SAM CLI    | <https://docs.aws.amazon.com/serverless-application-model/latest/developerguide/install-sam-cli.html>                       |
| AWS CLI v2     | <https://docs.aws.amazon.com/cli/latest/userguide/getting-started-install.html>                                             |
| Gemini account | <https://aistudio.google.com> (free tier sufficient for testing)                                                            |
| Docker         | E2E isolated MongoDB (`pnpm run e2e:docker:up`)                                                                             |
| MongoDB        | Existing app DB (Prisma 6 + MongoDB) — no new connection, only new fields                                                   |

---

## 4. Secrets, keys & accounts

### 4.1 Gemini API key (the only required third-party key)

1. **Sign up / sign in:** <https://aistudio.google.com>
2. **Create a key:** <https://aistudio.google.com/apikey> → _Create API Key_ → copy it (shown once).
3. **Store it in AWS SSM Parameter Store as a SecureString** at the exact path the Lambda reads
   (`/fakefour/gemini/api-key` — hard-coded in `template.yaml` as `SSM_PATH_GEMINI_API_KEY`):

```bash
aws ssm put-parameter \
  --name "/fakefour/gemini/api-key" \
  --type "SecureString" \
  --value "AIza_REPLACE_WITH_YOUR_GEMINI_KEY" \
  --region us-east-1 \
  --overwrite
```

> The key lives **only** in SSM. It is never committed, never put in `.env`, and never passed to
> the web app — the Lambda fetches and caches it per cold start. The IAM policy in `template.yaml`
> grants the function `ssm:GetParameter` on this one path plus `kms:Decrypt` on `alias/aws/ssm`.

Model choice: the Gemini model id ships in code as `DEFAULT_GEMINI_MODEL`
(`bio-generator/src/types.ts`, currently `gemini-2.5-pro`) — change it there and
redeploy. It is deliberately **not** a SAM parameter: CloudFormation reuses a
parameter's previous value across deploys, which once left a retired model id
pinned in production. The `GEMINI_MODEL` env var remains honored by the handler
as a temporary, console-set emergency override only.

### 4.2 GitHub Actions secrets (for automated Lambda deploys)

`.github/workflows/deploy-bio-generator.yml` deploys via GitHub OIDC (no static AWS keys). Set in
**Repo → Settings → Secrets and variables → Actions**
(<https://github.com/braveneworg/boudreaux/settings/secrets/actions>):

| Secret                | Purpose                                                                                                              |
| --------------------- | -------------------------------------------------------------------------------------------------------------------- |
| `AWS_DEPLOY_ROLE_ARN` | IAM role assumed via OIDC; needs CloudFormation/Lambda/IAM/S3/SSM-describe + **SNS + CloudWatch** + SAM-bucket perms |
| `ALERT_EMAIL`         | SNS subscription email for the Lambda error alarm (empty disables the alarm)                                         |

OIDC trust setup (one-time, if not already present): create a GitHub OIDC provider and a role per
<https://docs.github.com/en/actions/deployment/security-hardening-your-deployments/configuring-openid-connect-in-amazon-web-services>.

**Deploy-role SNS + CloudWatch permissions.** When `ALERT_EMAIL` is set, the stack creates an SNS
topic and a CloudWatch alarm, so the OIDC role needs permission to manage both — otherwise stack
creation rolls back. The usual symptom is `SNS:GetTopicAttributes ... AccessDenied` (CloudFormation
reads the topic back after creating it), leaving the stack in `ROLLBACK_COMPLETE`. Grant the role
(run with **admin** creds; the OIDC role can't widen its own policy — replace `<ACCOUNT_ID>` and
`<DEPLOY_ROLE_NAME>`):

```bash
cat > deploy-sns-cw-perms.json <<'EOF'
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "sns:CreateTopic", "sns:DeleteTopic",
        "sns:GetTopicAttributes", "sns:SetTopicAttributes",
        "sns:Subscribe", "sns:ListSubscriptionsByTopic",
        "sns:TagResource", "sns:UntagResource", "sns:ListTagsForResource"
      ],
      "Resource": "arn:aws:sns:us-east-1:<ACCOUNT_ID>:fakefour-bio-generator-alarms"
    },
    { "Effect": "Allow", "Action": ["sns:Unsubscribe", "sns:GetSubscriptionAttributes"], "Resource": "*" },
    { "Effect": "Allow",
      "Action": ["cloudwatch:PutMetricAlarm", "cloudwatch:DescribeAlarms", "cloudwatch:DeleteAlarms"],
      "Resource": "*" }
  ]
}
EOF

aws iam put-role-policy \
  --role-name <DEPLOY_ROLE_NAME> \
  --policy-name bio-generator-sns-cloudwatch \
  --policy-document file://deploy-sns-cw-perms.json

rm deploy-sns-cw-perms.json
```

> The subscription actions (`sns:Unsubscribe`, `sns:GetSubscriptionAttributes`) and CloudWatch
> actions use `Resource: "*"` because they key off dynamic subscription/alarm ARNs, not the topic
> ARN. To avoid this whole permission class, deploy with an empty `AlarmEmail` (clear `ALERT_EMAIL`)
> — `template.yaml` gates the SNS topic on `HasAlarmEmail`, so no topic is created.

### 4.3 Web-app runtime environment (so the app can invoke the Lambda + write S3)

Set these on the **running web app** (EC2/container runtime env — the same place
`DATABASE_URL`/`AWS_*` already live; **not** build-time `NEXT_PUBLIC_*` only):

| Variable                                      | Required | Read by                                             | Value                                                    |
| --------------------------------------------- | -------- | --------------------------------------------------- | -------------------------------------------------------- |
| `BIO_GENERATOR_LAMBDA_NAME`                   | ✅ prod  | `bio-generation-service.ts`                         | `fakefour-bio-generator` (the SAM `FunctionName` output) |
| `BIO_GENERATOR_FAKE`                          | dev/E2E  | `bio-generation-service.ts`, `bio-image-service.ts` | `true` to skip AWS and use the deterministic fixture     |
| `AWS_REGION`                                  | ✅       | `LambdaClient`, `s3-client.ts`                      | `us-east-1`                                              |
| `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` | ✅       | `s3-client.ts`, AWS SDK                             | App IAM user/role creds (see 4.4)                        |
| `AWS_S3_BUCKET_NAME` (or `S3_BUCKET`)         | ✅       | `s3-client.ts`                                      | Media bucket that backs the CDN                          |
| `NEXT_PUBLIC_CDN_DOMAIN` (or `CDN_DOMAIN`)    | ✅       | `cdn-url.ts`, `build-cdn-image-variant-url.ts`      | `https://cdn.fakefourrecords.com`                        |

`BIO_GENERATOR_LAMBDA_NAME` is enforced by `env-validation.ts`. After deploying the Lambda, read
the name back with:

```bash
aws cloudformation describe-stacks \
  --stack-name fakefour-bio-generator --region us-east-1 \
  --query 'Stacks[0].Outputs[?OutputKey==`FunctionName`].OutputValue' --output text
```

> `.env.example` lists `AWS_REGION`, `AWS_S3_BUCKET_NAME`/`S3_BUCKET`,
> `NEXT_PUBLIC_CDN_DOMAIN`/`CDN_DOMAIN`, and now `BIO_GENERATOR_LAMBDA_NAME` /
> `BIO_GENERATOR_FAKE` (new with this feature). Set the runtime values per the table above.

### 4.4 App IAM permissions

The web app's AWS principal must be allowed to invoke the Lambda and write re-hosted bio images.
That principal is whatever `AWS_ACCESS_KEY_ID`/`AWS_SECRET_ACCESS_KEY` the running app uses (the
pair injected by `deploy.yml`'s `.env.deploy`) — static keys, so almost always an **IAM user**.

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": "lambda:InvokeFunction",
      "Resource": "arn:aws:lambda:us-east-1:<ACCOUNT_ID>:function:fakefour-bio-generator"
    },
    {
      "Effect": "Allow",
      "Action": ["s3:PutObject"],
      "Resource": "arn:aws:s3:::<MEDIA_BUCKET>/media/artists/*/bio/*"
    }
  ]
}
```

**Apply it via the CLI** (run the `iam:*` commands with **admin** creds — the app's own keys can't
modify their own policies). First identify the principal and account, then render and attach the
policy as a reusable customer-managed policy:

```bash
# 1. Identify the principal (run with the APP's creds) + grab the account id
aws sts get-caller-identity   # Arn → .../user/<NAME> (IAM user) or .../assumed-role/<ROLE>/...
ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
MEDIA_BUCKET=<your-media-bucket>            # same value as the app's AWS_S3_BUCKET_NAME / S3_BUCKET

# 2. Render the policy from the JSON above (placeholders filled)
cat > bio-app-policy.json <<EOF
{
  "Version": "2012-10-17",
  "Statement": [
    { "Effect": "Allow", "Action": "lambda:InvokeFunction",
      "Resource": "arn:aws:lambda:us-east-1:${ACCOUNT_ID}:function:fakefour-bio-generator" },
    { "Effect": "Allow", "Action": ["s3:PutObject"],
      "Resource": "arn:aws:s3:::${MEDIA_BUCKET}/media/artists/*/bio/*" }
  ]
}
EOF

# 3. Create the managed policy, then attach to the principal from step 1 (pick ONE)
POLICY_ARN=$(aws iam create-policy --policy-name fakefour-bio-app \
  --policy-document file://bio-app-policy.json --query 'Policy.Arn' --output text)
aws iam attach-user-policy --user-name <NAME> --policy-arn "$POLICY_ARN"   # IAM user
aws iam attach-role-policy --role-name <ROLE> --policy-arn "$POLICY_ARN"   # IAM role

rm bio-app-policy.json
```

To **update** the policy later, publish a new default version instead of recreating it
(`create-policy` errors if the name already exists):

```bash
aws iam create-policy-version --policy-arn "$POLICY_ARN" \
  --policy-document file://bio-app-policy.json --set-as-default
```

**Verify** the effective permissions against the real ARNs (both rows should read `allowed`):

```bash
aws iam simulate-principal-policy \
  --policy-source-arn "arn:aws:iam::${ACCOUNT_ID}:user/<NAME>" \
  --action-names lambda:InvokeFunction s3:PutObject \
  --resource-arns \
    "arn:aws:lambda:us-east-1:${ACCOUNT_ID}:function:fakefour-bio-generator" \
    "arn:aws:s3:::${MEDIA_BUCKET}/media/artists/000/bio/x.jpg" \
  --query 'EvaluationResults[].{action:EvalActionName,decision:EvalDecision}' --output table
```

### 4.5 CloudFront / S3 image delivery

Re-hosted images are written to `s3://<MEDIA_BUCKET>/media/artists/{artistId}/bio/{n}-{rand}.{ext}`
with `_w{width}.{ext}` and `_w{width}.webp` variants, and served through the CDN by the custom
loader (`src/lib/image-loader.ts`). Ensure your CloudFront distribution fronts the media bucket at
`NEXT_PUBLIC_CDN_DOMAIN`. The image hosts are already allow-listed in `next.config.ts`
(`cdn.fakefourrecords.com`, `picsum.photos`, `upload.wikimedia.org`, `commons.wikimedia.org`);
add your CDN hostname there if it differs.

### 4.6 Jina web-search key (optional — always-on web context)

The Lambda grounds on the **full Wikipedia article body** and, when this key is configured, **always**
merges in **Jina** web-search content as additional context for every artist (not just a fallback)
— this also covers artists with no MusicBrainz/Wikipedia match. It is **entirely optional**: when the
SSM parameter below is absent, `getSearchApiKey()` returns `null` and the Lambda grounds on Wikipedia

- facts alone rather than aborting.

1. **Sign up / sign in:** <https://jina.ai> (free tier sufficient for testing).
2. **Create a key** and store it as a SecureString at the path the Lambda reads
   (`/fakefour/jina/api-key` — hard-coded in `template.yaml` as `SSM_PATH_JINA_API_KEY`):

```bash
aws ssm put-parameter \
  --name "/fakefour/jina/api-key" \
  --type "SecureString" \
  --value "jina_REPLACE_WITH_YOUR_JINA_KEY" \
  --region us-east-1 \
  --overwrite
```

> Like the Gemini key, this lives **only** in SSM. The IAM policy in `template.yaml` already grants the
> function `ssm:GetParameter` on this path. To disable web-search context later, delete the parameter
> — no redeploy needed. The function `Timeout` is **600s (10 min)** to allow the always-on search
> plus lengthy, image-rich generation; the web app's invoke client uses a matching request timeout.

---

## 5. Setup steps (clean checkout → working feature)

```bash
# 0. Toolchain
nvm use                                   # Node 24 from .nvmrc
corepack enable && corepack prepare pnpm@11.3.0 --activate

# 1. Web app deps + Prisma client (adds the new bio fields/models)
pnpm install
pnpm exec prisma generate
pnpm exec prisma db push                  # MongoDB: pushes Artist bio fields + ArtistBioImage/Link

# 2. Store the Gemini key in SSM (section 4.1)
aws ssm put-parameter --name "/fakefour/gemini/api-key" --type SecureString \
  --value "AIza_REPLACE_WITH_YOUR_GEMINI_KEY" --region us-east-1 --overwrite

# 3. Deploy the Lambda — option A: CI (push to main touching bio-generator/**)
#    option B: locally with SAM
cd bio-generator
pnpm install --frozen-lockfile
pnpm run test:run                         # Lambda tests; must pass before deploy
npm install -g esbuild                    # SAM esbuild bundler
sam build
sam deploy \
  --s3-bucket fakefour-sam-artifacts-us-east-1 --s3-prefix fakefour-bio-generator \
  --stack-name fakefour-bio-generator --region us-east-1 \
  --capabilities CAPABILITY_NAMED_IAM \
  --no-confirm-changeset --no-fail-on-empty-changeset \
  --parameter-overrides Environment=production "AlarmEmail=you@example.com"
cd ..

# 4. Wire the web app to the Lambda (runtime env, section 4.3)
#    BIO_GENERATOR_LAMBDA_NAME=fakefour-bio-generator  (+ AWS_*, S3, CDN already set)
```

**Local dev without AWS:** set `BIO_GENERATOR_FAKE=true` and run `pnpm run dev` — generation returns
the deterministic fixture (`src/lib/services/bio-generation-fixture.ts`), images render from
`picsum.photos`, and no Lambda/S3/Gemini calls are made.

---

## 6. Run / reproduce

1. `pnpm run dev` (or your deployed app).
2. Go to **`/admin/artists`** → edit an artist (edit mode is required; generation needs a persisted
   artist id).
3. Under the **Biography** heading, use **AI Bio Generation**: optionally add reference links / notes,
   click **Generate bios**. The short/long bios, discovered images, and links populate the form;
   review and **Save**.
4. Edit any of the three bio fields in the **Tiptap rich-text editors** (bold, italic, font-size,
   link, insert artist image), then **Save**.
5. View public output: **`/artists`** (index card), **`/artists/<slug>`** (detail), and
   **`/artists/<slug>/bio`** (full bio). Inline links render as hardened Next `Link`s
   (`rel="nofollow noopener noreferrer"`) and inline images as Next `Image`s with `_w{width}` srcset.

Expected in prod: new objects under `s3://<bucket>/media/artists/.../bio/` with `_w{width}.webp`
siblings; bio `<img>` srcset uses the CDN loader (no `/_next/image`).

---

## 7. Verification

```bash
# Web app unit suite (includes bio service/components/sanitizer/hooks)
pnpm run typecheck && pnpm run test:run && pnpm run lint && pnpm run format

# Lambda suite (separate pnpm workspace)
cd bio-generator && pnpm run test:run && cd ..

# E2E (isolated Docker Mongo, fake generation)
pnpm run e2e:docker:up
pnpm exec playwright test e2e/tests/artists e2e/tests/admin-artist-bio-generation.spec.ts
pnpm run e2e:docker:down
```

Passing looks like: app suite green (8400+ tests), Lambda suite green, and the targeted E2E
green — the admin flow generates/edits/saves a bio and the public bio page renders a nofollow Next
`Link` and a CDN Next `Image` with a `_w{width}` srcset.

Smoke-test the deployed Lambda directly:

```bash
aws lambda invoke --function-name fakefour-bio-generator --region us-east-1 \
  --cli-binary-format raw-in-base64-out \
  --payload '{"artistId":"000000000000000000000000","displayName":"Radiohead"}' \
  /tmp/bio-out.json && cat /tmp/bio-out.json   # expect {"ok":true,"data":{...}}
```

---

## 8. Teardown

```bash
# Stop E2E services
pnpm run e2e:docker:down

# Remove the Lambda stack (deletes function, alarm, SNS topic)
aws cloudformation delete-stack --stack-name fakefour-bio-generator --region us-east-1

# Remove the Gemini secret
aws ssm delete-parameter --name "/fakefour/gemini/api-key" --region us-east-1

# Unset web-app env: BIO_GENERATOR_LAMBDA_NAME (+ BIO_GENERATOR_FAKE)
# Optional: clear re-hosted images
# aws s3 rm "s3://<MEDIA_BUCKET>/media/artists/" --recursive --exclude "*" --include "*/bio/*"
```

Bio data lives in existing Artist documents (`bio`, `shortBio`, `altBio`, `bioImages`, `bioLinks`).
To clear it, null those fields / delete the `ArtistBioImage`/`ArtistBioLink` rows via
`pnpm exec prisma studio`. The schema fields are additive and safe to leave in place.

---

## 9. Architecture

**Generation flow.** Admin action → `generateArtistBioAction` (admin-gated) →
`BioGenerationService.generateForArtist`. The service reads the artist, then either returns the
**fixture** (`BIO_GENERATOR_FAKE=true`) or **invokes the Lambda** (`BIO_GENERATOR_LAMBDA_NAME`) via
`@aws-sdk/client-lambda`. The Lambda (`handler.ts`) gathers facts from MusicBrainz → Wikidata →
Wikimedia Commons, asks Gemini for grounded prose (key from **SSM**), ranks primary images, and
returns `{ok, data:{shortBio, longBio, genres, images, links, model}}`. The LLM never emits URLs.

**Image re-hosting.** For each discovered image, `BioImageService.rehostWithVariants` fetches it,
`PutObject`s the original to S3 under `media/artists/{id}/bio/...`, then `generateVariantsFromBuffer`
writes `sharp` `_w{width}` (+ `.webp`) variants. The service stores the **CDN URL**; attribution is
dropped. Bio link hrefs are filtered to `http(s)` before persisting.

**Rendering.** `sanitizeBioHtml`/`sanitizeBioText` enforce allowlists on write and read; `BioHtml`
maps `<a>`/`<img>` to Next `Link`/`Image` (CDN loader). Three bio fields are Tiptap rich-text
editors; generation is routed through `useGenerateArtistBioMutation`.

**Diagrams:**

- Setup / secrets / config flow — [`artist-bios-setup.pdf`](./artist-bios-setup.pdf)
- Runtime architecture — [`artist-bios-architecture.pdf`](./artist-bios-architecture.pdf)
- Generation sequence — [`artist-bios-sequence.pdf`](./artist-bios-sequence.pdf)
- Data model — [`artist-bios-erd.pdf`](./artist-bios-erd.pdf)

---

## 10. Troubleshooting

| Symptom                                                                      | Likely cause                                                  | Fix                                                                                                                                |
| ---------------------------------------------------------------------------- | ------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `Bio generator is not configured (BIO_GENERATOR_LAMBDA_NAME unset)`          | App runtime env missing the var                               | Set `BIO_GENERATOR_LAMBDA_NAME=fakefour-bio-generator` (4.3)                                                                       |
| Lambda error: `SSM parameter /fakefour/gemini/api-key returned no value`     | Secret not created or wrong region                            | Re-run the `aws ssm put-parameter` (4.1) in `us-east-1`                                                                            |
| Lambda `AccessDenied` on `ssm:GetParameter`/`kms:Decrypt`                    | Stack out of date                                             | Re-deploy; IAM policy is in `template.yaml`                                                                                        |
| SAM deploy rolls back; events show `SNS:GetTopicAttributes ... AccessDenied` | Deploy role lacks SNS/CloudWatch perms                        | Add the SNS + CloudWatch policy to the OIDC role (4.2), delete the rolled-back stack, then redeploy                                |
| `sam deploy` fails: waiter matched `ROLLBACK_COMPLETE`                       | First-create failed; the stack can't be updated in this state | `aws cloudformation delete-stack --stack-name fakefour-bio-generator` + `wait stack-delete-complete`, fix the root cause, redeploy |
| App `AccessDenied` invoking Lambda / `PutObject`                             | App IAM missing perms                                         | Attach the policy in 4.4                                                                                                           |
| `Invalid src prop … hostname not configured`                                 | New image host not allow-listed                               | The custom `loaderFile` normally bypasses this; add the host to `next.config.ts` `remotePatterns` if using the default loader      |
| Bio images 403 on the CDN                                                    | Requested width has no `_w{width}` variant                    | Ensure `images.imageSizes`/`deviceSizes` match `IMAGE_VARIANT_DEVICE_SIZES`; variants are written by `image-variants.ts`           |
| `git push` fails pre-push `tsc` under Node v22                               | Hook ran with system Node                                     | `nvm use` (Node 24) **before** `git push`                                                                                          |
| MusicBrainz lookups return nothing / 503                                     | Missing `User-Agent` or 1 req/s rate limit                    | `User-Agent` is set in `types.ts`; the handler degrades to prose-only on failure                                                   |
| E2E hits real S3/Gemini                                                      | Fake mode not set                                             | Ensure `BIO_GENERATOR_FAKE=true` (Playwright web server sets it)                                                                   |
