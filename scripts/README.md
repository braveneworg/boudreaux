# Scripts Documentation

This directory contains utility scripts for managing various aspects of the application.

## MongoDB Backup/Restore Script

A TypeScript script for backing up and restoring MongoDB databases with full support for data, structure, and constraints.

### Prerequisites

Install MongoDB Database Tools:

```bash
# macOS
brew install mongodb/brew/mongodb-database-tools

# Ubuntu/Debian
sudo apt-get install mongodb-database-tools

# Windows
# Download from https://www.mongodb.com/try/download/database-tools
```

### Usage

#### Create a Backup

```bash
# Create backup with auto-generated filename (saved to /backups)
npm run mongo:dump

# Create backup with custom filename
npm run mongo:dump backups/2026-02-07T10-00-00-mongo-backup.archive

# Or run directly
npx tsx scripts/mongo-backup.ts dump [output-file]
```

#### Restore from Backup

```bash
# Restore from backup file
npm run mongo:restore backups/2026-02-07T10-00-00-mongo-backup.archive

# Or run directly
npx tsx scripts/mongo-backup.ts restore <input-file>
```

### Features

- 📦 Full database backup including data, structure, indexes, and constraints
- 🗜️ Gzip compression for smaller backup files (no need for additional tar.gz)
- 🔄 Complete restore with `--drop` flag to ensure clean state
- 📁 Auto-creates backup directory if it doesn't exist
- 🏷️ Auto-generated ISO 8601 timestamped filenames (e.g., `2026-02-07T21-45-14-mongo-backup.archive`)
- 🗑️ Automatic cleanup - keeps only the 5 most recent backups
- 🛡️ Connection string parsing from DATABASE_URL environment variable
- ✅ Clear success/error messages

### Backup Format

Backups are saved in MongoDB's archive format (`.archive` files) with **built-in gzip compression**. This format:

- Contains all collections, indexes, and metadata
- Is already compressed by `mongodump --gzip` (no need for additional tar.gz compression)
- Can be restored to any MongoDB version compatible with your data
- Preserves all constraints and validation rules
- Typically achieves 90%+ compression ratio

**Note:** The archive files are already gzip-compressed by MongoDB's tools, so additional tar.gz compression would provide minimal space savings while adding complexity to the backup/restore process.

### Environment Variables

The script uses `DATABASE_URL` from your environment:

```bash
DATABASE_URL="mongodb+srv://user:password@host/database?options"
```

This is automatically read from `.env.local` or `.env` files.

---

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
