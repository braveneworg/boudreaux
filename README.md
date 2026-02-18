# Boudreaux

[![CI](https://github.com/braveneworg/boudreaux/actions/workflows/ci.yml/badge.svg)](https://github.com/braveneworg/boudreaux/actions/workflows/ci.yml)
[![Deploy](https://github.com/braveneworg/boudreaux/actions/workflows/deploy.yml/badge.svg)](https://github.com/braveneworg/boudreaux/actions/workflows/deploy.yml)
[![Coverage](https://img.shields.io/endpoint?url=https://raw.githubusercontent.com/braveneworg/boudreaux/main/coverage-badge.json)](https://github.com/braveneworg/boudreaux/actions/workflows/ci.yml)
[![License: MPL 2.0](https://img.shields.io/badge/License-MPL_2.0-brightgreen.svg)](https://opensource.org/licenses/MPL-2.0)
[![Version](https://img.shields.io/badge/version-0.5.1-blue)](CHANGELOG.md)
[![Last Commit](https://img.shields.io/github/last-commit/braveneworg/boudreaux)](https://github.com/braveneworg/boudreaux/commits)
[![Issues](https://img.shields.io/github/issues/braveneworg/boudreaux)](https://github.com/braveneworg/boudreaux/issues)
[![Pull Requests](https://img.shields.io/github/issues-pr/braveneworg/boudreaux)](https://github.com/braveneworg/boudreaux/pulls)
[![Repo Size](https://img.shields.io/github/repo-size/braveneworg/boudreaux)](https://github.com/braveneworg/boudreaux)
[![Node Version](https://img.shields.io/badge/node-22.x-brightgreen.svg)](package.json)
[![Next.js](https://img.shields.io/badge/Next.js-16.1.6-black)](https://nextjs.org)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.9-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org)
[![TailwindCSS](https://img.shields.io/badge/TailwindCSS-Styling-06B6D4?logo=tailwindcss&logoColor=white)](https://tailwindcss.com)
[![Prisma](https://img.shields.io/badge/Prisma-ORM-2D3748?logo=prisma&logoColor=white)](https://www.prisma.io)
[![MongoDB](https://img.shields.io/badge/MongoDB-Database-47A248?logo=mongodb&logoColor=white)](https://www.mongodb.com)
[![Docker](https://img.shields.io/badge/Docker-Container-2496ED?logo=docker&logoColor=white)](https://www.docker.com)
[![AWS](https://img.shields.io/badge/AWS-EC2%20%2B%20S3-FF9900?logo=amazonaws&logoColor=white)](https://aws.amazon.com)
[![Vitest](https://img.shields.io/badge/Vitest-Testing-6E9F18?logo=vitest&logoColor=white)](https://vitest.dev)
[![Playwright](https://img.shields.io/badge/Playwright-E2E-2EAD33?logo=playwright&logoColor=white)](https://playwright.dev)

This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Purpose

To build and deploy a Next.js app with Docker, GitHub Container Registry, GitHub Actions, AWS EC2, and AWS S3 behind Cloudfront CDN.

## Set github secrets

See `.env.example` for required variables.

## Getting Started

First, run the development server:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## NPM Scripts

### Development

| Script          | Command                | Description                                 |
| --------------- | ---------------------- | ------------------------------------------- |
| `npm run dev`   | `next dev --turbopack` | Start the development server with Turbopack |
| `npm run build` | `next build`           | Create a production build                   |
| `npm run start` | `next start`           | Start the production server                 |

### Linting & Formatting

| Script                 | Command                                               | Description                              |
| ---------------------- | ----------------------------------------------------- | ---------------------------------------- |
| `npm run lint`         | `eslint . --ext .ts,.tsx,.js,.jsx`                    | Run ESLint on the project                |
| `npm run lint:fix`     | `eslint . --ext .ts,.tsx,.js,.jsx --fix`              | Run ESLint and auto-fix issues           |
| `npm run format`       | `prettier --write "**/*.{ts,tsx,js,jsx,json,css,md}"` | Format all files with Prettier           |
| `npm run format:check` | `prettier --check "**/*.{ts,tsx,js,jsx,json,css,md}"` | Check formatting without writing changes |
| `npm run lint:format`  | `npm run lint:fix && npm run format`                  | Run both lint fix and format in sequence |

### Testing

| Script                        | Command                                                                 | Description                            |
| ----------------------------- | ----------------------------------------------------------------------- | -------------------------------------- |
| `npm test`                    | `vitest`                                                                | Run tests in watch mode (default)      |
| `npm run test:run`            | `vitest run`                                                            | Run all tests once and exit            |
| `npm run test:watch`          | `vitest --watch`                                                        | Run tests in watch mode                |
| `npm run test:ui`             | `vitest --ui`                                                           | Open the Vitest UI in a browser        |
| `npm run test:coverage`       | `vitest run --coverage`                                                 | Run tests with coverage report         |
| `npm run test:coverage:check` | `vitest run --coverage && npx tsx scripts/check-coverage-regression.ts` | Run coverage and check for regressions |
| `npm run test:no-css`         | Temporarily disables PostCSS, runs tests, then restores it              | Run tests without CSS processing       |

### Database

| Script                  | Command                                   | Description                                |
| ----------------------- | ----------------------------------------- | ------------------------------------------ |
| `npm run seed`          | `tsx prisma/seed.ts`                      | Seed the database with initial data        |
| `npm run mongo:dump`    | `npx tsx scripts/mongo-backup.ts dump`    | Create a MongoDB backup archive            |
| `npm run mongo:restore` | `npx tsx scripts/mongo-backup.ts restore` | Restore the database from a backup archive |

### S3

| Script                  | Command                                | Description                        |
| ----------------------- | -------------------------------------- | ---------------------------------- |
| `npm run s3:backup`     | `npx tsx scripts/s3-backup.ts backup`  | Back up S3 bucket contents locally |
| `npm run s3:restore`    | `npx tsx scripts/s3-backup.ts restore` | Restore local backup to S3 bucket  |
| `npm run s3:list`       | `npx tsx scripts/s3-backup.ts list`    | List objects in the S3 bucket      |
| `npm run s3:upload`     | `npx tsx scripts/s3-backup.ts upload`  | Upload files to the S3 bucket      |
| `npm run images:upload` | `npx tsx scripts/upload-images.ts`     | Upload images to S3 bucket         |

### Docker

| Script                           | Command                                                   | Description                      |
| -------------------------------- | --------------------------------------------------------- | -------------------------------- |
| `npm run docker:build:website`   | `docker build -t ghcr.io/braveneworg/boudreaux/website .` | Build the website Docker image   |
| `npm run docker:push:website`    | `docker push ghcr.io/braveneworg/boudreaux/website`       | Push the website image to GHCR   |
| `npm run docker:build:nginx`     | `docker build -t ghcr.io/braveneworg/boudreaux/nginx .`   | Build the nginx Docker image     |
| `npm run docker:push:nginx`      | `docker push ghcr.io/braveneworg/boudreaux/nginx`         | Push the nginx image to GHCR     |
| `npm run docker:publish:website` | `docker:build:website && docker:push:website`             | Build and push the website image |
| `npm run docker:publish:nginx`   | `docker:build:nginx && docker:push:nginx`                 | Build and push the nginx image   |

### Other

| Script            | Command | Description                                                   |
| ----------------- | ------- | ------------------------------------------------------------- |
| `npm run prepare` | `husky` | Install Husky git hooks (runs automatically on `npm install`) |

## Database Backups

The project includes automated MongoDB backup and restore scripts.

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

### Creating Backups

```bash
# Create a backup with auto-generated timestamp filename
npm run mongo:dump

# Create a backup with custom filename
npm run mongo:dump backups/2026-02-07T10-00-00-mongo-backup.archive
```

Backups are automatically:

- Saved to the `/backups` directory with ISO 8601 timestamps (e.g., `2026-02-07T21-49-07-mongo-backup.archive`)
- Compressed with gzip for efficient storage (~90% compression)
- Limited to the 5 most recent backups (older ones are automatically deleted)

### Restoring from Backup

```bash
# Restore from a backup file
npm run mongo:restore backups/2026-02-07T10-00-00-mongo-backup.archive
```

**⚠️ Warning:** Restoring will drop existing collections and replace them with the backup data.

### What's Included

Each backup includes:

- All database collections and documents
- Indexes and constraints
- Database metadata
- Validation rules

For more details, see [scripts/README.md](scripts/README.md).

## Image Uploads

Upload images to the S3 bucket (and CDN) using the `images:upload` script. Files are placed under the `media/` prefix by default.

### Usage

```bash
# Upload a single image
npm run images:upload -- ./path/to/image.jpg

# Upload multiple images (comma-separated)
npm run images:upload -- ./photo1.jpg,./photo2.png

# Upload all images in a directory (recursive)
npm run images:upload -- --dir ./path/to/images/

# Upload with a custom S3 prefix (overrides default media/)
npm run images:upload -- ./image.jpg --prefix custom-folder

# Skip CloudFront cache invalidation
npm run images:upload -- ./image.jpg --no-invalidate
```

> **Note:** The `--` after `images:upload` is required for npm to forward arguments to the script.

### Options

| Flag                  | Description                                     |
| --------------------- | ----------------------------------------------- |
| `--dir, -d <path>`    | Upload all images from a directory recursively  |
| `--prefix, -p <path>` | S3 key prefix (default: `media`)                |
| `--no-invalidate`     | Skip CloudFront cache invalidation after upload |
| `--help, -h`          | Show help message                               |

### Supported Formats

jpg, jpeg, png, gif, webp, svg, ico, bmp, tiff, tif, avif

### Environment Variables

| Variable                     | Required | Description                                       |
| ---------------------------- | -------- | ------------------------------------------------- |
| `S3_BUCKET`                  | Yes      | S3 bucket name                                    |
| `AWS_REGION`                 | No       | AWS region (default: `us-east-1`)                 |
| `CLOUDFRONT_DISTRIBUTION_ID` | No       | CloudFront distribution ID for cache invalidation |

## Version Bumping

Version bumping, changelog generation, and GitHub Releases are fully automated via the deploy pipeline. After a successful deploy to production, the `version-bump` job in `deploy.yml` reads a PR label to determine the bump level.

### PR Labels

Every new PR is automatically labeled `version:minor`. Change the label before merging to control the version bump:

| Label           | Bump    | When to use                        | Example           |
| --------------- | ------- | ---------------------------------- | ----------------- |
| `version:patch` | `0.0.x` | Bug fixes, small changes           | `0.5.1` → `0.5.2` |
| `version:minor` | `0.x.0` | New features, non-breaking changes | `0.5.1` → `0.6.0` |
| `version:major` | `x.0.0` | Breaking changes                   | `0.5.1` → `1.0.0` |

Remove all version labels to skip the version bump entirely.

### What Happens Automatically

1. PR merges into `main`
2. CI runs (tests, lint, typecheck, build, e2e)
3. Deploy workflow builds Docker images and deploys to EC2
4. **Version bump job** (after successful deploy):
   - Reads the merged PR's label to determine bump type
   - Runs `npm version <patch|minor|major>`
   - Generates a CHANGELOG.md entry from the titles of pull requests associated with commits since the last tag
   - Commits with `chore(release): v<version> [skip ci]`
   - Creates a git tag and GitHub Release

### Changelog Format

Changelog entries follow [Keep a Changelog](https://keepachangelog.com/) format. The section header is inferred from the bump type:

- **major** → `### Changed`
- **minor** → `### Added`
- **patch** → `### Fixed`

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!
