<!--
This Source Code Form is subject to the terms of the Mozilla Public
License, v. 2.0. If a copy of the MPL was not distributed with this
file, You can obtain one at https://mozilla.org/MPL/2.0/.
-->

# Bio Generator Lambda

AI-powered artist bio generator. Lives in [`bio-generator/`](../../bio-generator) as a standalone
AWS SAM project (a separate pnpm workspace, mirroring `stripe-webhook/`). The web app invokes it
directly via the AWS SDK (`@aws-sdk/client-lambda`); it is **not** exposed over HTTP.

## What it does

Given an artist's name(s) plus optional reference links and an editor description, the Lambda:

1. **MusicBrainz** (`src/musicbrainz.ts`) — looks up the artist by name, resolves its Wikidata id
   and external relations (official site, Wikipedia, socials, MusicBrainz page).
2. **Wikidata** (`src/wikidata.ts`) — reads the entity's `P18` image file name(s), `P856` official
   website, and English Wikipedia sitelink.
3. **Wikimedia Commons** (`src/wikimedia.ts`) — resolves each image file name to a real,
   hotlinkable image URL with the **attribution + license** required to display it.
4. **Gemini** (`src/gemini.ts`) — writes the short + long bio prose in JSON mode, grounded on the facts
   gathered above so it does not invent discography/dates. The model also ranks which 2–3 images
   best identify the artist. **The LLM never produces image or link URLs** — those come only from
   the real sources above, which is why nothing 404s.

The handler (`src/handler.ts`) orchestrates these, degrades gracefully (prose-only) when no
MusicBrainz match is found or a metadata call fails, and returns a discriminated result envelope:

```jsonc
// success
{ "ok": true, "data": { "shortBio": "...", "longBio": "<p>...</p>", "genres": "...",
                        "images": [{ "url": "...", "attribution": "...", "isPrimary": true }],
                        "links": [{ "label": "Wikipedia", "url": "...", "kind": "wikipedia" }],
                        "model": "gemini-flash-latest" } }
// failure
{ "ok": false, "error": "..." }
```

The request/response Zod schemas are the contract and live in `src/types.ts`. The web app
re-declares the same shapes in `src/lib/validation/bio-generation-schema.ts`.

## Free, no-key data sources

- **MusicBrainz** and **Wikimedia** require only a descriptive `User-Agent` (no API key). The UA is
  the `USER_AGENT` constant in `src/types.ts`.
- **Gemini** needs an API key, stored in SSM (below). Free tier.

## Secrets / configuration

| Where                                  | Name                                    | Purpose                                            |
| -------------------------------------- | --------------------------------------- | -------------------------------------------------- |
| AWS SSM Parameter Store (SecureString) | `/fakefour/gemini/api-key`              | Gemini API key — Lambda only                       |
| Web app env                            | `BIO_GENERATOR_LAMBDA_NAME`             | Function name to invoke (`fakefour-bio-generator`) |
| Web app IAM identity                   | `lambda:InvokeFunction` on the function | Lets the app invoke it                             |

The Gemini key is **never** in the web app or CI — only the Lambda reads it from SSM at runtime.

## How it was created

```bash
# 1. Scaffold mirrors stripe-webhook/: package.json, tsconfig.json, vitest.config.ts,
#    pnpm-workspace.yaml, template.yaml, src/*, events/sample.json

# 2. Install + test (from bio-generator/)
cd bio-generator
pnpm install
pnpm run test:run        # unit tests (fetch + Gemini + SSM all mocked)

# 3. Store the Gemini key once (SecureString, KMS-encrypted)
aws ssm put-parameter \
  --name /fakefour/gemini/api-key \
  --type SecureString \
  --value "<YOUR_GEMINI_API_KEY>" \
  --overwrite

# 4. Build + deploy with SAM (esbuild bundles handler.ts, externalising @aws-sdk/*)
sam build
sam deploy --guided      # first time: pick stack name e.g. fakefour-bio-generator
# subsequent deploys:
sam deploy

# 5. Note the FunctionName output → set BIO_GENERATOR_LAMBDA_NAME in the app env
```

### Local invocation

```bash
# Requires a Gemini key reachable via SSM (or stub getGeminiApiKey). Build first.
sam build
sam local invoke BioGeneratorFunction -e events/sample.json
```

## CI/CD

Deployed by [`.github/workflows/deploy-bio-generator.yml`](../../.github/workflows/deploy-bio-generator.yml),
which mirrors the Stripe webhook workflow: it assumes the `AWS_DEPLOY_ROLE_ARN` OIDC role, runs
`sam build` + `sam deploy`, and triggers only on changes under `bio-generator/`. The Gemini key is
read from SSM at deploy/runtime — it is not a GitHub secret.

## Tests

`pnpm run test:run` in `bio-generator/`. Every external call (`fetch`, SSM) is mocked, so the suite
is deterministic and offline. Covers: MusicBrainz relation parsing, Wikidata claim extraction,
Commons attribution building, Gemini JSON-mode parsing/validation, and the full handler orchestration
including graceful degradation paths.
