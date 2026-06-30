# Production Environment Variables Setup Guide

> **Canonical reference:** for the authoritative, code-derived list of auth env
> vars + services + setup steps, see
> [`better-auth-setup-guide.md`](./better-auth-setup-guide.md). This doc focuses
> on the **deployment mechanics** (GitHub Secrets → EC2). Auth specifics here
> have been reconciled with the better-auth + AWS SES migration.

## Problem

The application fails in production with:

```
Error: Missing required environment variables: DATABASE_URL, AUTH_SECRET, CLOUDFLARE_SECRET, EMAIL_FROM, AWS_ACCESS_KEY_ID, ...
```

## Solution Overview

Store sensitive environment variables as GitHub Secrets and inject them during deployment to AWS EC2.

## Step-by-Step Setup

### 1. Add Secrets to GitHub Repository

Go to: **Your Repository → Settings → Secrets and variables → Actions → New repository secret**

Add the following secrets:

#### Required Secrets

| Secret Name             | Description                          | Example Value                                                                |
| ----------------------- | ------------------------------------ | ---------------------------------------------------------------------------- |
| `DATABASE_URL`          | MongoDB connection string            | `mongodb+srv://user:pass@cluster.mongodb.net/db?retryWrites=true&w=majority` |
| `AUTH_SECRET`           | 32+ character random string for auth | Generate with: `openssl rand -base64 32`                                     |
| `AUTH_URL`              | Your production URL (better-auth)    | `https://fakefourrecords.com`                                                |
| `EMAIL_FROM`            | SES-verified from address            | `noreply@fakefourrecords.com`                                                |
| `AWS_ACCESS_KEY_ID`     | AWS creds for SES + S3 (runtime)     | `AKIA…`                                                                      |
| `AWS_SECRET_ACCESS_KEY` | AWS creds for SES + S3 (runtime)     | `<secret>`                                                                   |
| `AWS_REGION`            | SES region                           | `us-east-1`                                                                  |

> **Magic-link delivery is AWS SES, not SMTP.** The app sends via the SES SDK
> (`SendRawEmailCommand`), so the AWS credentials above are what matter for
> sign-in email. The old `EMAIL_SERVER_*` SMTP vars have been removed — do not
> set them.

#### Optional Secrets

| Secret Name                       | Description                                | Default |
| --------------------------------- | ------------------------------------------ | ------- |
| `AUTH_DISABLE_SIGNUP`             | `"true"` pauses new signups (env override) | open    |
| `GOOGLE_CLIENT_ID`                | Google OAuth client ID                     | -       |
| `GOOGLE_CLIENT_SECRET`            | Google OAuth secret                        | -       |
| `FACEBOOK_CLIENT_ID` / `_SECRET`  | Facebook OAuth                             | -       |
| `TWITTER_CLIENT_ID` / `_SECRET`   | X/Twitter OAuth                            | -       |
| `APPLE_CLIENT_ID` / `_SECRET`     | Apple OAuth (`_SECRET` is a generated JWT) | -       |
| `NEXT_PUBLIC_CLOUDFLARE_SITE_KEY` | Cloudflare Turnstile key                   | -       |
| `CLOUDFLARE_SECRET`               | Turnstile server-side verify secret        | -       |

### 2. Generate Strong AUTH_SECRET

Run this command to generate a secure AUTH_SECRET:

```bash
openssl rand -base64 32
```

Or use Node.js:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

### 3. Email Delivery Setup — AWS SES

Transactional email (including the magic-link sign-in email) is sent through the
**AWS SES SDK**, not SMTP. There is no SMTP host/user/password to configure for
delivery — only AWS credentials, a region, and a verified `EMAIL_FROM`.

1. In the AWS console, open **SES** in your target region.
2. **Verify the sender identity** — verify the `EMAIL_FROM` domain (set up DKIM)
   or at minimum the individual address.
3. **Request production access** — a new SES account is sandboxed and can only
   send to verified recipients. Request a sending-limit increase before launch.
4. Create an **IAM user/role** with `ses:SendRawEmail` (and the S3 permissions
   the app already needs for presigned URLs), and use its credentials:
   ```
   AWS_ACCESS_KEY_ID=<access_key>
   AWS_SECRET_ACCESS_KEY=<secret_key>
   AWS_REGION=us-east-1
   EMAIL_FROM=noreply@fakefourrecords.com
   ```

> The old `EMAIL_SERVER_*` SMTP vars are gone — not used for delivery and no
> longer required at boot. Do not set them.

### 4. Verify GitHub Actions Workflow

The workflow (`.github/workflows/deploy.yml`) has been updated to:

1. Read secrets from GitHub
2. Create a `.env` file with all variables
3. Copy the `.env` file to EC2
4. Use it with `docker-compose.prod.yml`

### 5. Deploy

Once secrets are added, push to main branch:

```bash
git add .
git commit -m "Add production environment configuration"
git push origin main
```

GitHub Actions will automatically:

1. Build Docker images
2. Push to GitHub Container Registry
3. Deploy to AWS EC2 with environment variables

## Verification

### Check if secrets are being used:

1. Go to GitHub → Actions → Your workflow run
2. Look for the "Add environment variables to .env" step
3. You should see it creating the .env file (values are hidden)

### Check on EC2:

SSH into your EC2 instance and verify the container has the environment variables:

```bash
ssh your-user@your-ec2-ip

# Check if .env file exists
cat ~/.env

# Check running container environment
docker exec website env | grep DATABASE_URL
docker exec website env | grep AUTH_SECRET
```

### Test the application:

1. Visit your production URL
2. Try to sign in with email (magic link)
3. Check logs if there are issues:
   ```bash
   docker logs website
   ```

## Security Best Practices

### ✅ DO

- Store all secrets in GitHub Secrets
- Use different secrets for production vs development
- Rotate secrets regularly (especially AUTH_SECRET)
- Use environment-specific MongoDB databases
- Enable 2FA on your GitHub account
- Restrict EC2 SSH access to specific IPs

### ❌ DON'T

- Commit `.env` files to git (already in `.gitignore`)
- Share secrets in Slack/email
- Use the same AUTH_SECRET across environments
- Use production credentials in development
- Expose secrets in logs or error messages

## Troubleshooting

### Error: Missing required environment variables

**Cause**: Secrets not added to GitHub or not passed to container

**Fix**:

1. Verify secrets exist in GitHub repository settings
2. Check the GitHub Actions workflow completed successfully
3. SSH to EC2 and verify `.env` file exists
4. Check `docker-compose.prod.yml` has `environment:` section

### Error: Invalid DATABASE_URL format

**Cause**: MongoDB connection string is malformed

**Fix**:

- Ensure URL is properly encoded
- Special characters in password must be URL-encoded
- Format: `mongodb+srv://username:password@host/database?options`

### Error: magic-link email not sending

**Cause**: SES misconfiguration (delivery is SES, not SMTP)

**Fix**:

- Ensure `EMAIL_FROM` is set **and** verified in SES for the configured region.
- Verify `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` / `AWS_REGION` are present
  and the IAM identity has `ses:SendRawEmail`.
- If still sandboxed, SES only delivers to verified recipients — request
  production access.
- `EMAIL_FROM is not configured` in logs ⇒ `EMAIL_FROM` is unset.
- Do **not** chase SMTP ports/firewall — no SMTP socket is used.

### Container starts but environment variables are missing

**Cause**: Docker compose not reading .env file

**Fix**:

```bash
# On EC2, manually test docker compose
cd ~
cat .env  # Verify file exists and has content
docker compose -f docker-compose.prod.yml config  # Preview the configuration
docker compose -f docker-compose.prod.yml down
docker compose -f docker-compose.prod.yml up -d
```

## Environment Variable Reference

Complete list of all environment variables the application uses:

### Required (Application will fail without these)

- `DATABASE_URL` - MongoDB connection string
- `AUTH_SECRET` - Authentication secret (32+ chars)
- `EMAIL_FROM` - SES-verified sender address
- `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` / `AWS_REGION` - SES + S3
- (see `env-validation.ts` for the full required list: Stripe, Pusher, Upstash,
  Cloudflare, bio-generator Lambda, etc.)

### Optional (Has defaults or gracefully degrades)

- `NODE_ENV` - Environment (`production`, `development`) - Default: `development`
- `AUTH_URL` - Canonical app URL for better-auth (base URL + OAuth callbacks)
- `AUTH_DISABLE_SIGNUP` - `"true"` pauses new signups - Default: open
- `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` - Google OAuth (per provider)
- `FACEBOOK_*` / `TWITTER_*` / `APPLE_*` - other OAuth providers (per provider)
- `NEXT_PUBLIC_CLOUDFLARE_SITE_KEY` / `CLOUDFLARE_SECRET` - Turnstile CAPTCHA
- `NEXT_TELEMETRY_DISABLED` - Disable Next.js telemetry - Default: `1`

### AWS/CDN (Used at runtime AND by scripts)

AWS credentials are now used **at runtime** (SES email delivery + S3 presigned
URLs), not only by scripts.

- `AWS_ACCESS_KEY_ID`
- `AWS_SECRET_ACCESS_KEY`
- `AWS_REGION`
- `AWS_S3_BUCKET_NAME` (runtime; `S3_BUCKET` is used by some scripts)
- `CDN_DOMAIN`
- `CLOUDFRONT_DISTRIBUTION_ID`

## Local Development

For local development, copy `.env.example` to `.env.local`:

```bash
cp .env.example .env.local
```

Then fill in your local development values. Never commit `.env.local` to git.

## Additional Resources

- [Next.js Environment Variables](https://nextjs.org/docs/app/building-your-application/configuring/environment-variables)
- [GitHub Actions Secrets](https://docs.github.com/en/actions/security-guides/encrypted-secrets)
- [Docker Compose Environment Variables](https://docs.docker.com/compose/environment-variables/)
- [MongoDB Connection Strings](https://www.mongodb.com/docs/manual/reference/connection-string/)

## Related Files

- `.env.example` - Template for environment variables
- `docker-compose.yml` - Local development configuration
- `docker-compose.prod.yml` - Production configuration
- `.github/workflows/deploy.yml` - CI/CD pipeline
- `src/lib/config/env-validation.ts` - Environment validation logic
