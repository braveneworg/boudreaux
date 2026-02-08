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

## S3 Backup/Restore Script

A TypeScript script for backing up S3 bucket contents to your local machine and restoring them when needed.

### Prerequisites

Ensure you have AWS credentials configured:

```bash
# AWS credentials (via environment variables or ~/.aws/credentials)
export AWS_ACCESS_KEY_ID="your-access-key"
export AWS_SECRET_ACCESS_KEY="your-secret-key"

# Or use AWS profile
export AWS_PROFILE="your-profile-name"
```

### Usage

#### Create a Backup

```bash
# Create backup with auto-generated directory name (e.g., backups/s3-2026-02-07T10-00-00)
npm run s3:backup

# Create backup with custom directory
npm run s3:backup -- backups/my-s3-backup

# Or run directly
npx tsx scripts/s3-backup.ts backup [local-directory]
```

#### Restore from Backup

```bash
# Restore from backup directory
npm run s3:restore -- backups/s3-2026-02-07T10-00-00

# Restore with overwrite flag (replaces existing files in S3)
npm run s3:restore -- backups/s3-2026-02-07T10-00-00 --overwrite

# Or run directly
npx tsx scripts/s3-backup.ts restore <local-directory> [--overwrite]
```

#### List Available Backups

```bash
# List all S3 backups in the backups directory
npm run s3:list

# List backups in a custom directory
npx tsx scripts/s3-backup.ts list <custom-backups-directory>
```

### Features

- 📦 Full S3 bucket backup including all files and metadata
- 📁 Auto-creates timestamped backup directories
- 🔄 Complete restore with optional overwrite protection
- 📊 Detailed backup metadata in JSON format
- 🏷️ Preserves content types during restore (limited metadata support)
- 🔍 Prefix filtering support for partial backups
- ✅ Progress tracking and clear success/error messages
- 🛡️ Safe restore mode (skips existing files by default)
- 📋 Pagination support for large buckets
- 🗑️ Automatic cleanup - keeps only the 5 most recent backups (configurable)

### Backup Format

Backups are saved in a directory structure that mirrors your S3 bucket:

```
backups/s3-2026-02-07T10-00-00/
├── backup-metadata.json     # Backup information and file manifest
├── folder1/
│   ├── file1.jpg
│   └── file2.png
└── folder2/
    └── file3.txt
```

The `backup-metadata.json` file contains:

- Timestamp of backup
- Source bucket name and region
- Total files and size
- Complete file manifest with metadata

### Environment Variables

Set these environment variables before running the script:

```bash
# Required
S3_BUCKET="your-s3-bucket-name"

# Optional
AWS_REGION="us-east-1"                    # Default: us-east-1
S3_BACKUP_PREFIX=""                       # Default: "" (entire bucket)
S3_MAX_BACKUPS="5"                        # Default: 5 (number of backups to keep)
```

These are automatically read from `.env.local` or `.env` files.

**Automatic Cleanup**: After each successful backup, the script automatically removes old backups, keeping only the most recent `S3_MAX_BACKUPS` backups (default: 5). This prevents unlimited disk usage growth.

### Examples

#### Backup entire bucket

```bash
npm run s3:backup
```

#### Backup only media files

```bash
S3_BACKUP_PREFIX="media/" npm run s3:backup backups/media-only
```

#### Restore and overwrite existing files

```bash
npm run s3:restore backups/s3-2026-02-07T10-00-00 --overwrite
```

#### View all backups

```bash
npm run s3:list
```

---

# Image Upload Utility

A TypeScript script that uploads images to S3 with support for single files, multiple comma-separated files, or entire directories.

## Usage

### Environment Variables

Set these environment variables before running the script:

```bash
# Required
export S3_BUCKET="your-s3-bucket-name"

# Optional
export AWS_REGION="us-east-1"  # Default: us-east-1
export CLOUDFRONT_DISTRIBUTION_ID="your-cloudfront-distribution-id"  # For cache invalidation
```

### Upload Single Image

```bash
npm run images:upload public/media/profile.jpg
```

### Upload Multiple Images (Comma-Separated)

```bash
npm run images:upload ./images/photo1.jpg,./images/photo2.png,./images/photo3.webp
```

### Upload All Images from a Directory (Recursive)

```bash
npm run images:upload --dir public/media/gallery
```

### Upload with Custom S3 Prefix

```bash
# Single file with prefix
npm run images:upload public/avatar.jpg --prefix user-content/

# Directory with prefix
npm run images:upload --dir ./uploads --prefix user-uploads/2026/
```

### Skip CloudFront Cache Invalidation

```bash
npm run images:upload public/photo.jpg --no-invalidate
```

### Direct Usage

```bash
# With tsx
npx tsx scripts/upload-images.ts public/media/photo.jpg

# Or run with Node
chmod +x scripts/upload-images.ts
./scripts/upload-images.ts --dir ./images
```

## Features

- 📸 Upload single or multiple images
- 📂 Recursive directory upload
- 🔗 Support for both relative and absolute paths
- 🌐 Automatic content type detection
- ⚡ CloudFront cache invalidation
- 🎨 Colored console output with progress
- 📊 Upload summary with statistics
- 🛡️ Error handling with detailed reporting

## Supported Image Formats

The script automatically filters for these image formats:

- **JPEG**: `.jpg`, `.jpeg`
- **PNG**: `.png`
- **GIF**: `.gif`
- **WebP**: `.webp`
- **SVG**: `.svg`
- **Icon**: `.ico`
- **Bitmap**: `.bmp`
- **TIFF**: `.tiff`, `.tif`
- **AVIF**: `.avif`

Non-image files are automatically skipped with a warning message.

## Path Handling

The script intelligently handles different path formats:

### Relative Paths

```bash
# Current directory
npm run images:upload ./photo.jpg

# Subdirectories
npm run images:upload images/gallery/photo.jpg
```

### Absolute Paths

```bash
npm run images:upload /Users/username/projects/app/public/media/photo.jpg
```

### Public Directory

Files in the `public/` directory are automatically mapped correctly:

```bash
# Uploads to S3 as: media/photo.jpg (not public/media/photo.jpg)
npm run images:upload public/media/photo.jpg
```

## S3 Key Generation

The script generates S3 keys with smart path handling:

- Removes `public/` prefix automatically
- Removes leading slashes and `./`
- Converts backslashes to forward slashes (Windows compatibility)
- Applies optional prefix to all uploaded files

### Examples

```bash
# Input: public/media/photo.jpg
# S3 Key: media/photo.jpg

# Input: ./images/avatar.png
# S3 Key: images/avatar.png

# Input: public/media/photo.jpg --prefix cdn/
# S3 Key: cdn/media/photo.jpg
```

## Command-Line Options

| Option              | Alias | Description                                  |
| ------------------- | ----- | -------------------------------------------- |
| `--dir <directory>` | `-d`  | Upload all images from directory (recursive) |
| `--prefix <prefix>` | `-p`  | S3 key prefix for uploaded files             |
| `--no-invalidate`   |       | Skip CloudFront cache invalidation           |
| `--help`            | `-h`  | Show help message                            |

## Examples

### Upload Profile Picture

```bash
npm run images:upload public/media/profiles/user-123.jpg --prefix users/profiles/
```

### Upload Gallery Images

```bash
npm run images:upload --dir public/media/gallery --prefix gallery/2026/
```

### Upload Multiple Event Photos

```bash
npm run images:upload \
  ./events/photo1.jpg,./events/photo2.jpg,./events/photo3.jpg \
  --prefix events/conference-2026/
```

### Upload Without Cache Invalidation

```bash
npm run images:upload --dir ./temp-images --no-invalidate
```

## Output Example

```
[UPLOAD-IMAGES] Starting upload to S3 bucket: my-bucket
[UPLOAD-IMAGES] Using S3 prefix: user-content/
[UPLOAD-IMAGES] Uploading: ./photo.jpg → s3://my-bucket/user-content/photo.jpg
[UPLOAD-IMAGES] ✓ Uploaded: user-content/photo.jpg (245.5 KB)
[UPLOAD-IMAGES] Invalidating CloudFront cache for 1 file(s)...
[UPLOAD-IMAGES] ✓ CloudFront cache invalidation initiated

============================================================
[UPLOAD-IMAGES] Upload Summary: 1 successful, 0 failed, 0 skipped
============================================================
```

## Error Handling

The script provides detailed error reporting:

- File not found errors
- Non-image file warnings
- S3 upload failures
- CloudFront invalidation errors (non-fatal)

Errors are collected and displayed in a summary at the end.

## Integration with CI/CD

```yaml
# GitHub Actions example
- name: Upload media assets
  env:
    S3_BUCKET: ${{ secrets.S3_BUCKET }}
    CLOUDFRONT_DISTRIBUTION_ID: ${{ secrets.CLOUDFRONT_DISTRIBUTION_ID }}
    AWS_ACCESS_KEY_ID: ${{ secrets.AWS_ACCESS_KEY_ID }}
    AWS_SECRET_ACCESS_KEY: ${{ secrets.AWS_SECRET_ACCESS_KEY }}
  run: |
    npm run images:upload --dir public/media
```

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
