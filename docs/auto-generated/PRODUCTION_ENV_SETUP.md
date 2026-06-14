# Production Environment Variables Setup Guide

## Problem

The application fails in production with:

```
Error: Missing required environment variables: DATABASE_URL, AUTH_SECRET, EMAIL_SERVER_HOST, EMAIL_SERVER_USER, EMAIL_SERVER_PASSWORD, EMAIL_FROM
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
| `NEXTAUTH_URL`          | Your production URL                  | `https://yourdomain.com`                                                     |
| `EMAIL_SERVER_HOST`     | SMTP server hostname                 | `smtp.sendgrid.net` or `smtp.gmail.com`                                      |
| `EMAIL_SERVER_USER`     | SMTP username                        | `apikey` (SendGrid) or your email                                            |
| `EMAIL_SERVER_PASSWORD` | SMTP password                        | Your SMTP password or API key                                                |
| `EMAIL_FROM`            | From email address                   | `noreply@yourdomain.com`                                                     |

#### Optional Secrets

| Secret Name                       | Description              | Default |
| --------------------------------- | ------------------------ | ------- |
| `EMAIL_SERVER_PORT`               | SMTP port                | `587`   |
| `GOOGLE_CLIENT_ID`                | Google OAuth client ID   | -       |
| `GOOGLE_CLIENT_SECRET`            | Google OAuth secret      | -       |
| `NEXT_PUBLIC_CLOUDFLARE_SITE_KEY` | Cloudflare Turnstile key | -       |

### 2. Generate Strong AUTH_SECRET

Run this command to generate a secure AUTH_SECRET:

```bash
openssl rand -base64 32
```

Or use Node.js:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

### 3. Email Provider Setup

#### Option A: SendGrid (Recommended for production)

1. Sign up at [sendgrid.com](https://sendgrid.com)
2. Create an API key in Settings → API Keys
3. Use these values:
   ```
   EMAIL_SERVER_HOST=smtp.sendgrid.net
   EMAIL_SERVER_PORT=587
   EMAIL_SERVER_USER=apikey
   EMAIL_SERVER_PASSWORD=<your_sendgrid_api_key>
   EMAIL_FROM=noreply@yourdomain.com
   ```

#### Option B: Gmail (For testing)

1. Enable 2-factor authentication on your Google account
2. Generate an App Password: [myaccount.google.com/apppasswords](https://myaccount.google.com/apppasswords)
3. Use these values:
   ```
   EMAIL_SERVER_HOST=smtp.gmail.com
   EMAIL_SERVER_PORT=587
   EMAIL_SERVER_USER=your.email@gmail.com
   EMAIL_SERVER_PASSWORD=<app_password>
   EMAIL_FROM=your.email@gmail.com
   ```

#### Option C: AWS SES

```
EMAIL_SERVER_HOST=email-smtp.us-east-1.amazonaws.com
EMAIL_SERVER_PORT=587
EMAIL_SERVER_USER=<your_smtp_username>
EMAIL_SERVER_PASSWORD=<your_smtp_password>
EMAIL_FROM=verified@yourdomain.com
```

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

### Error: SMTP Authentication failed

**Cause**: Wrong email credentials or server

**Fix**:

- Verify EMAIL_SERVER_HOST is correct
- For Gmail, ensure you're using an App Password (not your regular password)
- For SendGrid, username should be literally "apikey"
- Check firewall allows outbound SMTP connections (port 587 or 465)

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
- `EMAIL_SERVER_HOST` - SMTP server
- `EMAIL_SERVER_USER` - SMTP username
- `EMAIL_SERVER_PASSWORD` - SMTP password
- `EMAIL_FROM` - Sender email address

### Optional (Has defaults or gracefully degrades)

- `NODE_ENV` - Environment (`production`, `development`) - Default: `development`
- `NEXTAUTH_URL` - Application URL - Default: `http://localhost:3000`
- `EMAIL_SERVER_PORT` - SMTP port - Default: `587`
- `GOOGLE_CLIENT_ID` - Google OAuth (optional)
- `GOOGLE_CLIENT_SECRET` - Google OAuth (optional)
- `NEXT_PUBLIC_CLOUDFLARE_SITE_KEY` - Turnstile CAPTCHA (optional)
- `NEXT_TELEMETRY_DISABLED` - Disable Next.js telemetry - Default: `1`

### AWS/CDN (Used by scripts, not runtime)

- `AWS_ACCESS_KEY_ID`
- `AWS_SECRET_ACCESS_KEY`
- `AWS_REGION`
- `S3_BUCKET`
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
- `src/app/lib/config/env-validation.ts` - Environment validation logic
