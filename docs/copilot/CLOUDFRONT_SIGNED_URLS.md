# CloudFront Signed URLs for Paid Downloads

> Reference guide for the migration from S3 presigned URLs to CloudFront signed URLs
> for gated digital-format downloads, plus the AWS console + env steps required
> to operate it in production.

## Why CloudFront signed URLs

Originally, every paid download in [`download-authorization-service.ts`](../../src/lib/services/download-authorization-service.ts)
called `generatePresignedDownloadUrl` from [`s3-client.ts`](../../src/lib/utils/s3-client.ts),
producing an S3 presigned `GET` URL. That works, but every byte egresses
**directly from S3** at ~$0.085/GB with **zero cache benefit** — the presigned
signature is part of the URL, so even repeat downloads of the same file pay
full egress every time.

CloudFront signed URLs solve this:

| Concern                   | S3 presigned | CloudFront signed                  |
| ------------------------- | ------------ | ---------------------------------- |
| Per-request authorization | ✅           | ✅                                 |
| Time-limited              | ✅           | ✅                                 |
| Tied to a specific S3 key | ✅           | ✅                                 |
| Served from edge cache    | ❌           | ✅                                 |
| Egress cost on cache hit  | $0.085/GB    | ~$0                                |
| Egress cost on cache miss | $0.085/GB    | $0.085/GB (CloudFront), free S3→CF |
| Signing CPU cost          | ~1 ms RSA    | ~1 ms RSA                          |

For repeat-downloaded content (popular paid releases, bundle ZIPs that get
re-downloaded), CloudFront's edge cache absorbs nearly all of the per-byte
S3 cost.

> **SSL certs cannot replace this.** TLS protects the connection, signing
> protects the _URL_. They solve different problems and are not substitutable.

---

## Architecture

The implementation is a transparent swap inside `generatePresignedDownloadUrl`:

```
caller (e.g. DownloadAuthorizationService)
  └─ generatePresignedDownloadUrl(s3Key, fileName, expiresIn)
       ├─ try generateCloudFrontSignedUrl(...)
       │    └─ if env vars configured → return CloudFront signed URL
       └─ else fall back to S3 getSignedUrl(GetObjectCommand)
```

**Files involved:**

- [`src/lib/utils/cloudfront-signed-url.ts`](../../src/lib/utils/cloudfront-signed-url.ts) — RSA-signs URLs using `@aws-sdk/cloudfront-signer`
- [`src/lib/utils/s3-client.ts`](../../src/lib/utils/s3-client.ts) — call sites (unchanged); `generatePresignedDownloadUrl` delegates
- [`src/lib/utils/cloudfront-signed-url.spec.ts`](../../src/lib/utils/cloudfront-signed-url.spec.ts) — unit tests

**Behaviour:**

- When `CLOUDFRONT_KEY_PAIR_ID` + private key + `NEXT_PUBLIC_CDN_DOMAIN` are
  all set → CloudFront signed URLs (production).
- When any are missing → automatic fallback to S3 presigned URLs (dev / E2E /
  CI / disaster recovery).

This means **every existing call site benefits with zero further changes**
and tests/local dev keep working with no extra configuration.

---

## One-time AWS setup

### Step 1 — Generate the RSA key pair locally

CloudFront requires a 2048-bit RSA key in PEM format.

```bash
mkdir -p ~/.aws/cloudfront-keys && cd ~/.aws/cloudfront-keys

openssl genrsa -out private_key.pem 2048
openssl rsa -pubout -in private_key.pem -out public_key.pem

chmod 600 private_key.pem
```

> Treat `private_key.pem` like an AWS root credential. Never commit it.
> Never email it. Never paste it into Slack.

### Step 2 — Upload the public key to CloudFront

**AWS Console** → **CloudFront** → left nav → **Key management** → **Public keys** → **Create public key**

| Field | Value                                                             |
| ----- | ----------------------------------------------------------------- |
| Name  | `boudreaux-downloads-YYYY-MM` (date-stamp the name)               |
| Key   | Full contents of `public_key.pem` (including `BEGIN`/`END` lines) |

Click **Create public key** and copy the resulting **ID** (looks like
`K2JCJMDEHXQW5F`). This is your `CLOUDFRONT_KEY_PAIR_ID`.

### Step 3 — Create a key group

**Key management** → **Key groups** → **Create key group**

| Field       | Value                      |
| ----------- | -------------------------- |
| Name        | `boudreaux-downloads`      |
| Public keys | Select the key from step 2 |

Key groups are what get attached to a distribution behaviour. They allow
zero-downtime rotation: add a new key alongside the old one, switch the env
var to the new key ID, then remove the old key after the longest URL TTL has
elapsed.

### Step 4 — Configure the distribution behaviour

**Distributions** → click the `cdn.fakefourrecords.com` distribution
(currently `E2QCL9RZEM5RZE`).

#### Recommended: protect only paid-download paths

**Behaviors** → **Create behavior**

| Setting                        | Value                                                                                                                                                                                                                                                                                                                                       |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Path pattern                   | `releases/*/digital-formats/*` (verify against `src/lib/services/upload-service.ts`)                                                                                                                                                                                                                                                        |
| Origin                         | The existing S3 origin                                                                                                                                                                                                                                                                                                                      |
| Viewer access                  | **Yes** → **Trusted key groups** → `boudreaux-downloads`                                                                                                                                                                                                                                                                                    |
| Cache policy                   | `CachingOptimized`                                                                                                                                                                                                                                                                                                                          |
| Origin request policy          | ~~Custom — must forward query strings: `response-content-disposition`, `response-content-type`~~ Custom is disabled, no necessary because the response-content-disposition and response-content-type query strings we sign are interpreted by S3 automatically as part of the GET, and OAC handles auth, there's nothing custom to forward. |
| Compress objects automatically | No (audio + zip are already compressed)                                                                                                                                                                                                                                                                                                     |
| Behavior priority              | Above the catch-all `Default (*)`                                                                                                                                                                                                                                                                                                           |

> **Why the query-string forwarding matters:** the signed URL embeds
> `response-content-disposition` and `response-content-type` so the browser
> downloads the file with the correct filename. If CloudFront strips those
> query strings before talking to S3, the file downloads with its raw S3
> key as the name.

> **Why not protect the default behaviour:** public images and the audio
> player would then also require signed URLs and break.

Save changes. Distribution status will show **Deploying** for 5–10 minutes.

### Step 5 — Verify S3 access is locked down

Direct S3 access should remain blocked (OAC-only). Otherwise people can
bypass signed URLs by going straight to the S3 URL.

```bash
# Direct S3: must 403
curl -I https://fakefourmedia.s3.us-east-1.amazonaws.com/releases/SOME_ID/digital-formats/MP3_320KBPS/track.mp3

# Unsigned CDN URL on a protected path: must 403 (after step 4 deploys)
curl -I https://cdn.fakefourrecords.com/releases/SOME_ID/digital-formats/MP3_320KBPS/track.mp3
```

Both must return 403. If the unsigned CDN URL returns 200, the behaviour
priority is wrong — the catch-all is matching first.

The OAC + bucket policy from [`scripts/fix-cloudfront-s3-access.sh`](../../scripts/fix-cloudfront-s3-access.sh)
already provides the correct setup.

---

## Environment variables

Set these in production (Vercel / Docker / wherever you deploy):

```bash
CLOUDFRONT_KEY_PAIR_ID=K2JCJMDEHXQW5F
NEXT_PUBLIC_CDN_DOMAIN=https://cdn.fakefourrecords.com
```

Then choose **one** of the following two formats for the private key.

### Option A — base64-encoded PEM (recommended)

Avoids all newline-escaping pitfalls in env loaders.

```bash
# Encode locally:
base64 -i ~/.aws/cloudfront-keys/private_key.pem | pbcopy

# In your environment:
CLOUDFRONT_PRIVATE_KEY_BASE64=LS0tLS1CRUdJTi...
```

### Option B — multiline PEM with literal `\n`

Works in most env managers; the utility automatically converts `\n` to real
newlines.

```bash
CLOUDFRONT_PRIVATE_KEY="-----BEGIN RSA PRIVATE KEY-----\nMIIEow...\n...IDAQAB\n-----END RSA PRIVATE KEY-----"
```

### Production secret storage

Do not put the raw key in `.env.local` for shared/staging environments, and
**never bake it into a Docker image** (it would land in image layers in GHCR).

This repo uses GitHub Actions → SCP `.env` → `docker-compose.prod.yml` for
deploys. The secrets are wired through that path:

| Variable                        | Where to set                                                                                                          | Notes                                                              |
| ------------------------------- | --------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| `NEXT_PUBLIC_CDN_DOMAIN`        | **GitHub repo secret** (already used as a Docker `--build-arg` in [`deploy.yml`](../../.github/workflows/deploy.yml)) | Public; baked into client bundle at build time. Required at build. |
| `CLOUDFRONT_KEY_PAIR_ID`        | **GitHub repo secret**                                                                                                | Low sensitivity (just an identifier). Injected at runtime.         |
| `CLOUDFRONT_PRIVATE_KEY_BASE64` | **GitHub repo secret** (use a protected `production` environment)                                                     | High sensitivity. Injected at runtime only.                        |

The deploy workflow already references these secrets in the **Create .env
for remote** step and `docker-compose.prod.yml` already maps them into the
container `environment:` block, so once the GitHub secrets are populated
the next deploy will pick them up.

**To populate the secrets:**

```bash
# CLOUDFRONT_PRIVATE_KEY_BASE64 — copy and paste into GitHub:
base64 -i ~/.aws/cloudfront-keys/private_key.pem | pbcopy

# Then in GitHub:
#   Repo → Settings → Secrets and variables → Actions → New repository secret
#     Name:  CLOUDFRONT_KEY_PAIR_ID
#     Value: K2JCJMDEHXQW5F   (from CloudFront console, step 2)
#
#     Name:  CLOUDFRONT_PRIVATE_KEY_BASE64
#     Value: <paste from clipboard>
#
#     Name:  NEXT_PUBLIC_CDN_DOMAIN   (if not already set)
#     Value: https://cdn.fakefourrecords.com
```

For higher-sensitivity environments later, AWS Secrets Manager (with rotation)
or SSM Parameter Store SecureString (already used by `stripe-webhook/`) are
both reasonable upgrades, but they require the runtime to fetch on boot
rather than rely on the env var.

---

## Verification after deploy

```bash
# 1. Trigger a real paid download in the UI; capture the signed URL
#    from the network tab or app logs.

# 2. Confirm the URL works:
curl -I "<signed-url>"
# Expect: HTTP/2 200, content-disposition: attachment; filename="..."

# 3. Hit it again to confirm cache:
curl -I "<signed-url>" | grep -i x-cache
# Expect (after first miss):
#   x-cache: Hit from cloudfront

# 4. Confirm unsigned access fails on the same path:
curl -I "https://cdn.fakefourrecords.com/<same-s3-key>"
# Expect: HTTP/2 403, x-cache: Error from cloudfront
```

If `x-cache: Hit from cloudfront` shows up on repeat downloads, you are now
serving paid content from the edge cache instead of paying full S3 egress.

---

## Key rotation (annually, or on suspected compromise)

CloudFront keys should be rotated regularly. The key-group design makes this
zero-downtime:

1. **Generate a new keypair locally** (step 1 above; date-stamp the name).
2. **Upload the new public key** to CloudFront (step 2).
3. **Add the new public key to the existing key group** — leave the old one
   in place. Key group now contains 2 keys; CloudFront accepts URLs signed
   by either.
4. **Update env vars** `CLOUDFRONT_KEY_PAIR_ID` (and the private key) to the
   new values, then redeploy.
5. **Wait for the longest URL TTL** to expire (24h in this codebase — see
   `PRESIGNED_URL_EXPIRATION.DOWNLOAD` in
   [`src/lib/constants/digital-formats.ts`](../../src/lib/constants/digital-formats.ts)).
6. **Remove the old public key** from the key group, then delete it.

If a key is suspected compromised, skip the wait in step 5 and rotate
immediately — outstanding URLs signed with the old key will start returning
403 once the key is removed from the group.

---

## Troubleshooting

| Symptom                                                          | Likely cause                                                                                                                                                          |
| ---------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| All downloads 403 with `MissingKey`                              | Behaviour attached but key group has no public keys, or key was deleted                                                                                               |
| All downloads 403 with `InvalidKey`                              | `CLOUDFRONT_KEY_PAIR_ID` mismatch — env var points to a key not in the trusted group                                                                                  |
| Downloads return 200 but with wrong filename                     | Origin request policy doesn't forward `response-content-disposition` query strings to S3                                                                              |
| Repeat downloads keep showing `x-cache: Miss`                    | Cache policy is `CachingDisabled`, or the URL changes between requests (signature includes Date — but for the same expiry it should be stable for the URL's lifetime) |
| Local dev still hitting S3 directly                              | Expected — env vars unset, fallback to S3 presigned URLs is intentional                                                                                               |
| Unsigned CDN URL returns 200 instead of 403                      | Behaviour path pattern doesn't match (check priority and pattern), or trusted key group not actually attached                                                         |
| `Error: error:1E08010C:DECODER routines::unsupported` at runtime | Private key not actually a valid PEM — check newlines (use `CLOUDFRONT_PRIVATE_KEY_BASE64` to be safe)                                                                |

---

## Cost model

For a hypothetical 100 GB/month of paid-download traffic in `us-east-1`:

| Setup                                         | Cache hit ratio | Cost / 100 GB                   |
| --------------------------------------------- | --------------- | ------------------------------- |
| S3 presigned (current behaviour without keys) | n/a             | ~$9.00 (above 100 GB free tier) |
| CloudFront signed, cold cache                 | 0 %             | ~$8.50                          |
| CloudFront signed, warm cache                 | 80 %            | ~$1.70                          |
| CloudFront signed, very popular content       | 95 %            | ~$0.43                          |

Plus negligible request costs (~$0.01 per million HTTP requests).

The break-even point versus extra operational complexity is roughly:
**any paid release that gets downloaded more than ~3 times** by anyone.

---

## Code reference

The transparent fallback means there is **one** place in code that needs
maintenance — the helper itself:

```ts
// src/lib/utils/cloudfront-signed-url.ts
export function generateCloudFrontSignedUrl(input: CloudFrontSignedUrlInput): string | null {
  const config = getCloudFrontSigningConfig();
  if (!config) {
    return null;
  }
  // ... signs URL, returns it
}
```

And the integration point:

```ts
// src/lib/utils/s3-client.ts
export async function generatePresignedDownloadUrl(s3Key, fileName, expiresIn) {
  const cloudFrontUrl = generateCloudFrontSignedUrl({ s3Key, fileName, expiresInSeconds });
  if (cloudFrontUrl) return cloudFrontUrl;

  // Fallback: S3 presigned URL
  // ...
}
```

That's the entire surface. Every existing caller — the [download
authorization service](../../src/lib/services/download-authorization-service.ts),
the [bundle download route](../../src/app/api/releases/[id]/download/bundle/route.ts),
any future callers — flows through this one helper.
