# CDN Sync Script

A TypeScript script that syncs Next.js static assets to S3 and invalidates CloudFront distribution.

## Usage

### Environment Variables

Set these environment variables before running the script:

```bash
# Required
export S3_BUCKET="your-s3-bucket-name"

# Optional
export CLOUDFRONT_DISTRIBUTION_ID="your-cloudfront-distribution-id"
export CDN_DOMAIN="https://cdn.fakefourrecords.com"
export SKIP_BUILD="false"
export SKIP_INVALIDATION="false"
```

### NPM Scripts

```bash
# Build Next.js and sync to CDN
npm run build:cdn

# Just sync (skip build)
npm run sync:cdn:no-build

# Run sync manually
npm run sync:cdn
```

### Direct Usage

```bash
# With tsx (recommended)
npx tsx scripts/sync-cdn.ts

# Make executable and run directly
chmod +x scripts/sync-cdn.ts
./scripts/sync-cdn.ts
```

## Features

- 🚀 Builds Next.js application
- 📦 Syncs `/_next/static/` files to S3 with immutable caching
- 🖼️ Syncs `/public/` files to S3 with appropriate caching
- 🏷️ Sets proper content types for different file types
- ⚡ Creates CloudFront invalidation
- 🎨 Colored console output
- 🛡️ Error handling and validation
- ⚙️ Configurable via environment variables

## Content Types

The script automatically sets proper content types for:

- **JavaScript**: `application/javascript`
- **CSS**: `text/css`
- **Images**: `image/png`, `image/jpeg`, `image/webp`, etc.
- **Fonts**: `font/woff`, `font/woff2`, `font/ttf`, etc.

## Caching Strategy

- **Static files** (`/_next/static/`): 1 year cache, immutable
- **Public files**: 24 hours cache
- **HTML files**: 5 minutes cache

## Integration

This script is designed to integrate into your CI/CD pipeline:

```yaml
# GitHub Actions example
- name: Install dependencies
  run: npm ci

- name: Build and sync to CDN
  env:
    S3_BUCKET: ${{ secrets.S3_BUCKET }}
    CLOUDFRONT_DISTRIBUTION_ID: ${{ secrets.CLOUDFRONT_DISTRIBUTION_ID }}
    AWS_ACCESS_KEY_ID: ${{ secrets.AWS_ACCESS_KEY_ID }}
    AWS_SECRET_ACCESS_KEY: ${{ secrets.AWS_SECRET_ACCESS_KEY }}
  run: npm run build:cdn
```
