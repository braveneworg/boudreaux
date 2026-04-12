# Scripts

Utility scripts for managing data, infrastructure, and deployment for the Fake Four Records platform.

## Quick Reference

| Script                               | pnpm command                                                  | Description                                                |
| ------------------------------------ | ------------------------------------------------------------- | ---------------------------------------------------------- |
| `mongo-backup.ts`                    | `pnpm run mongo:dump` / `mongo:restore`                       | Backup and restore MongoDB databases                       |
| `s3-backup.ts`                       | `pnpm run s3:backup` / `s3:restore` / `s3:list` / `s3:upload` | Backup and restore S3 bucket contents                      |
| `s3-apply-cache-headers.ts`          | `pnpm run s3:cache-headers`                                   | Apply Cache-Control headers to existing S3 media files     |
| `upload-images.ts`                   | `pnpm run images:upload`                                      | Upload images to S3 with content-type detection            |
| `sync-cdn.ts`                        | `pnpm exec tsx scripts/sync-cdn.ts`                           | Sync Next.js static assets to S3 and invalidate CloudFront |
| `stripe-seed.ts`                     | `pnpm run stripe:seed`                                        | Seed Stripe with subscription product and pricing tiers    |
| `check-coverage-regression.ts`       | `pnpm run test:coverage:check`                                | Compare test coverage against baseline thresholds          |
| `fix-featured-artist-connections.ts` | `pnpm exec tsx scripts/fix-featured-artist-connections.ts`    | Backfill Artist-to-FeaturedArtist connections              |
| `fix-stripe-customer-id-index.ts`    | `pnpm exec tsx scripts/fix-stripe-customer-id-index.ts`       | Migration: fix legacy stripeCustomerId index               |
| `create-stardust-svg.ts`             | `pnpm exec tsx scripts/create-stardust-svg.ts`                | Generate parameterized stardust texture SVGs               |
| `generate-stardust-svg.tsx`          | `pnpm exec tsx scripts/generate-stardust-svg.tsx`             | Generate stardust SVGs (TSX variant)                       |

### Shell Scripts

| Script                             | Description                                                    |
| ---------------------------------- | -------------------------------------------------------------- |
| `check-cloudfront-status.sh`       | Check CloudFront distribution status via AWS CLI               |
| `detailed-deployment-check.sh`     | Verify deployment by checking S3 webpack chunks and timestamps |
| `diagnose-cdn.sh`                  | Diagnose CloudFront and S3 configuration issues                |
| `fix-cloudfront-origin-path.sh`    | Update CloudFront origin path to resolve 403 errors            |
| `fix-cloudfront-s3-access.sh`      | Fix CloudFront OAC and S3 bucket policy for CDN access         |
| `force-container-refresh.sh`       | Force-refresh Docker containers on EC2 from GHCR               |
| `manual-deploy.sh`                 | Manual deployment to EC2 via SSH                               |
| `manually-attach-oac.sh`           | Create and attach an OAC to a CloudFront distribution          |
| `restart-containers.sh`            | Restart Docker containers on EC2 to pick up latest assets      |
| `revert-cloudfront-origin-path.sh` | Revert CloudFront origin path back to root                     |
| `verify-deployment-consistency.sh` | Verify S3 webpack chunks match what is live                    |

### Other

| Script            | Description                                                                               |
| ----------------- | ----------------------------------------------------------------------------------------- |
| `fix-releases.js` | MongoDB shell commands to fix releases with wrong field names and accidental soft-deletes |

---

## Shared Prerequisites

Most TypeScript scripts that interact with AWS require these environment variables (automatically read from `.env.local` or `.env`):

```bash
S3_BUCKET="your-s3-bucket-name"
AWS_REGION="us-east-1"                          # Default: us-east-1
AWS_ACCESS_KEY_ID="your-access-key"
AWS_SECRET_ACCESS_KEY="your-secret-key"
CLOUDFRONT_DISTRIBUTION_ID="your-dist-id"       # Optional, for cache invalidation
```

---

## MongoDB Backup/Restore

**File:** `mongo-backup.ts`

Backup and restore MongoDB databases with full support for data, structure, and constraints using `mongodump`/`mongorestore`.

### Prerequisites

```bash
# macOS
brew install mongodb/brew/mongodb-database-tools

# Ubuntu/Debian
sudo apt-get install mongodb-database-tools
```

### Usage

```bash
# Create backup with auto-generated filename (saved to /backups)
pnpm run mongo:dump

# Create backup with custom filename
pnpm run mongo:dump backups/2026-02-07T10-00-00-mongo-backup.archive

# Restore from backup file
pnpm run mongo:restore backups/2026-02-07T10-00-00-mongo-backup.archive
```

### Features

- Full database backup including data, structure, indexes, and constraints
- Gzip compression (built into MongoDB archive format)
- Complete restore with `--drop` flag for clean state
- Auto-generated ISO 8601 timestamped filenames
- Automatic cleanup — keeps only the 5 most recent backups
- Connection string parsing from `DATABASE_URL` environment variable

### Environment Variables

```bash
DATABASE_URL="mongodb+srv://user:password@host/database?options"
```

---

## S3 Backup/Restore

**File:** `s3-backup.ts`

Backup S3 bucket contents to your local machine and restore them when needed. Only processes media files (images, audio, video).

### Usage

```bash
# Backup with auto-generated directory name
pnpm run s3:backup

# Backup with custom directory
pnpm run s3:backup -- backups/my-s3-backup

# Restore from backup directory
pnpm run s3:restore -- backups/s3-2026-02-07T10-00-00

# Restore with overwrite (replaces existing files in S3)
pnpm run s3:restore -- backups/s3-2026-02-07T10-00-00 --overwrite

# Skip CloudFront invalidation after restore
pnpm run s3:restore -- backups/s3-2026-02-07T10-00-00 --skip-invalidation

# List available backups
pnpm run s3:list

# Upload local directory directly to S3
pnpm run s3:upload -- <local-directory>
```

### Features

- Full S3 bucket backup with metadata manifest (`backup-metadata.json`)
- Incremental detection — skips backup if nothing changed since last run
- Safe restore mode (skips existing files by default, use `--overwrite` to replace)
- Prefix filtering for partial backups (`S3_BACKUP_PREFIX`)
- Pagination support for large buckets
- Automatic cleanup — keeps only the N most recent backups
- CloudFront cache invalidation after restore/upload
- Path traversal protection via `sanitizeFilePath`

### Backup Format

```
backups/s3-2026-02-07T10-00-00/
├── backup-metadata.json     # Timestamp, bucket, file manifest
├── media/
│   ├── artists/
│   └── tracks/
```

### Environment Variables

```bash
S3_BUCKET="your-bucket"                # Required
AWS_REGION="us-east-1"                 # Default: us-east-1
S3_BACKUP_PREFIX=""                    # Default: "" (entire bucket)
S3_MAX_BACKUPS="5"                     # Default: 5
CLOUDFRONT_DISTRIBUTION_ID="..."       # Optional, for cache invalidation
SKIP_INVALIDATION="false"             # Optional, skip CloudFront invalidation
```

---

## S3 Cache Header Migration

**File:** `s3-apply-cache-headers.ts`

Applies `Cache-Control: public, max-age=31536000, immutable` to existing media files in S3 that are missing this header. Uses the S3 "copy-to-self" technique (`CopyObject` with `MetadataDirective: REPLACE`) since S3 does not support updating object metadata in place.

This is a one-time migration script for files uploaded before the caching strategy was implemented. New uploads already set this header automatically.

### Usage

```bash
# Dry run (default) — preview what would change
pnpm run s3:cache-headers

# Apply changes
pnpm run s3:cache-headers -- --apply

# Limit to a specific prefix
pnpm run s3:cache-headers -- --prefix media/tracks/
pnpm run s3:cache-headers -- --apply --prefix media/artists/artist-123/

# Force update even if Cache-Control is already set
pnpm run s3:cache-headers -- --apply --force
```

### Features

- Safe by default — dry run mode shows what would change without touching S3
- Paginates through large buckets automatically
- Skips non-media files (only processes images and audio)
- Skips objects that already have the correct header (unless `--force`)
- Preserves existing object metadata (`ContentType`, custom `Metadata`, `ContentDisposition`, etc.)
- Colored output with per-object status and summary

### Command-Line Options

| Option              | Description                                     |
| ------------------- | ----------------------------------------------- |
| `--apply`           | Actually modify S3 objects (default is dry run) |
| `--force`           | Update even if `Cache-Control` is already set   |
| `--prefix <prefix>` | S3 key prefix to scan (default: `media/`)       |
| `--help`, `-h`      | Show help message                               |

### Environment Variables

```bash
S3_BUCKET="your-bucket"     # Required
AWS_REGION="us-east-1"      # Default: us-east-1
```

---

## Image Upload

**File:** `upload-images.ts`

Upload images to S3 with support for single files, multiple comma-separated files, or entire directories. Automatically detects content types and optionally invalidates the CloudFront cache.

### Usage

```bash
# Upload single image
pnpm run images:upload public/media/profile.jpg

# Upload multiple images (comma-separated)
pnpm run images:upload ./images/photo1.jpg,./images/photo2.png

# Upload all images from a directory (recursive)
pnpm run images:upload --dir public/media/gallery

# Upload with custom S3 prefix
pnpm run images:upload public/avatar.jpg --prefix user-content/

# Skip CloudFront cache invalidation
pnpm run images:upload public/photo.jpg --no-invalidate
```

### Features

- Single file, multiple files (comma-separated), or recursive directory upload
- Automatic content-type detection via `mime`
- Smart S3 key generation (strips `public/` prefix, normalizes paths)
- CloudFront cache invalidation (individual paths for <=3000 files, wildcard for more)
- Colored output with upload summary

### Supported Formats

`.jpg`, `.jpeg`, `.png`, `.gif`, `.webp`, `.svg`, `.ico`, `.bmp`, `.tiff`, `.tif`, `.avif`

### Command-Line Options

| Option              | Alias | Description                                         |
| ------------------- | ----- | --------------------------------------------------- |
| `--dir <directory>` | `-d`  | Upload all images from directory (recursive)        |
| `--prefix <prefix>` | `-p`  | S3 key prefix for uploaded files (default: `media`) |
| `--no-invalidate`   |       | Skip CloudFront cache invalidation                  |
| `--help`            | `-h`  | Show help message                                   |

### Environment Variables

```bash
S3_BUCKET="your-bucket"                  # Required
AWS_REGION="us-east-1"                   # Default: us-east-1
CLOUDFRONT_DISTRIBUTION_ID="..."         # Optional, for cache invalidation
```

---

## CDN Sync

**File:** `sync-cdn.ts`

Syncs Next.js build output (`.next/static`) and public assets (`public/media`) to S3, then creates a CloudFront wildcard invalidation. Optionally builds the Next.js app first.

### Usage

```bash
# Run directly (recommended)
pnpm exec tsx scripts/sync-cdn.ts

# Skip the build step
SKIP_BUILD=true pnpm exec tsx scripts/sync-cdn.ts
```

### Pipeline

1. Validates config and tests S3 access
2. Optionally builds the Next.js app
3. Syncs `public/media` to S3 (24h cache for media, 5min for HTML)
4. Syncs `.next/static` to S3 under `_next/static` (1-year immutable cache, excludes `.map` files)
5. Syncs additional media from `music/`, `images/`, `videos/` if they exist
6. Creates CloudFront wildcard invalidation (`/*`)
7. Tests a sample file to confirm deployment

### Environment Variables

```bash
S3_BUCKET="your-bucket"                  # Required
CDN_DOMAIN="https://cdn.example.com"     # Required
CLOUDFRONT_DISTRIBUTION_ID="..."         # Optional, for invalidation
SKIP_BUILD="false"                       # Optional
SKIP_INVALIDATION="false"               # Optional
SKIP_CLEANUP="false"                     # Optional
```

---

## Stripe Seed

**File:** `stripe-seed.ts`

Seeds Stripe with the subscription product ("Fake Four Inc. Subscription") and its three pricing tiers.

### Usage

```bash
pnpm run stripe:seed
```

Creates:

- **Minimum tier**: $14.44/month
- **Extra tier**: $24.44/month
- **Extra Extra tier**: $44.44/month

---

## Coverage Regression Check

**File:** `check-coverage-regression.ts`

Compares current test coverage metrics against the baseline in `COVERAGE_METRICS.md`. Fails if any metric decreases beyond the 2% tolerance or drops below configured thresholds.

### Usage

```bash
# Run as part of coverage check (runs tests first)
pnpm run test:coverage:check

# Or run the check alone after generating coverage
pnpm exec tsx scripts/check-coverage-regression.ts
```

### Thresholds

- Statements, functions, lines: 95%
- Branches: 85%
- Tolerance: 2% decrease from baseline

---

## Data Migration Scripts

### Fix Featured Artist Connections

**File:** `fix-featured-artist-connections.ts`

Backfill script that connects `Artist` records to `FeaturedArtist` entries via release associations. Fixes "Unknown Artist" display issues.

```bash
# Dry run
pnpm exec tsx scripts/fix-featured-artist-connections.ts --dry-run

# Apply
pnpm exec tsx scripts/fix-featured-artist-connections.ts
```

### Fix Stripe Customer ID Index

**File:** `fix-stripe-customer-id-index.ts`

One-time migration that drops the legacy non-partial unique index on `User.stripeCustomerId` in MongoDB so Prisma can recreate it as a partial unique index (allowing multiple null values).

```bash
pnpm exec tsx scripts/fix-stripe-customer-id-index.ts
```

---

## SVG Generators

### Create Stardust SVG

**File:** `create-stardust-svg.ts`

CLI utility to generate parameterized stardust texture SVGs with configurable particle shapes (dot, diamond, triangle, wedge, crescent).

```bash
pnpm exec tsx scripts/create-stardust-svg.ts
```

### Generate Stardust SVG (TSX)

**File:** `generate-stardust-svg.tsx`

TSX variant of the stardust SVG generator.

```bash
pnpm exec tsx scripts/generate-stardust-svg.tsx
```

---

## Shell Scripts (Infrastructure)

These scripts manage AWS infrastructure and EC2 deployments. Most require AWS CLI and appropriate IAM credentials.

| Script                             | Usage                                        | What it does                                                        |
| ---------------------------------- | -------------------------------------------- | ------------------------------------------------------------------- |
| `check-cloudfront-status.sh`       | `./scripts/check-cloudfront-status.sh`       | Checks CloudFront distribution status                               |
| `detailed-deployment-check.sh`     | `./scripts/detailed-deployment-check.sh`     | Verifies S3 webpack chunks and timestamps match the build           |
| `diagnose-cdn.sh`                  | `./scripts/diagnose-cdn.sh`                  | Diagnoses CloudFront and S3 configuration issues                    |
| `fix-cloudfront-origin-path.sh`    | `./scripts/fix-cloudfront-origin-path.sh`    | Updates CloudFront origin path to fix 403 errors                    |
| `fix-cloudfront-s3-access.sh`      | `./scripts/fix-cloudfront-s3-access.sh`      | Fixes CloudFront OAC and S3 bucket policy                           |
| `force-container-refresh.sh`       | `./scripts/force-container-refresh.sh`       | Pulls latest Docker images from GHCR and restarts containers on EC2 |
| `manual-deploy.sh`                 | `./scripts/manual-deploy.sh`                 | Manual deployment to EC2 via SSH                                    |
| `manually-attach-oac.sh`           | `./scripts/manually-attach-oac.sh`           | Creates and attaches an OAC to a CloudFront distribution            |
| `restart-containers.sh`            | `./scripts/restart-containers.sh`            | Restarts Docker containers on EC2                                   |
| `revert-cloudfront-origin-path.sh` | `./scripts/revert-cloudfront-origin-path.sh` | Reverts CloudFront origin path to root                              |
| `verify-deployment-consistency.sh` | `./scripts/verify-deployment-consistency.sh` | Verifies S3 chunks match live deployment                            |

---

## CI/CD Integration

```yaml
# GitHub Actions example
- name: Install dependencies
  run: pnpm install --frozen-lockfile

- name: Build and sync to CDN
  env:
    S3_BUCKET: ${{ secrets.S3_BUCKET }}
    CLOUDFRONT_DISTRIBUTION_ID: ${{ secrets.CLOUDFRONT_DISTRIBUTION_ID }}
    AWS_ACCESS_KEY_ID: ${{ secrets.AWS_ACCESS_KEY_ID }}
    AWS_SECRET_ACCESS_KEY: ${{ secrets.AWS_SECRET_ACCESS_KEY }}
  run: pnpm exec tsx scripts/sync-cdn.ts

- name: Upload media assets
  env:
    S3_BUCKET: ${{ secrets.S3_BUCKET }}
    CLOUDFRONT_DISTRIBUTION_ID: ${{ secrets.CLOUDFRONT_DISTRIBUTION_ID }}
    AWS_ACCESS_KEY_ID: ${{ secrets.AWS_ACCESS_KEY_ID }}
    AWS_SECRET_ACCESS_KEY: ${{ secrets.AWS_SECRET_ACCESS_KEY }}
  run: pnpm run images:upload --dir public/media
```
