# Boudreaux

[![CI](https://github.com/braveneworg/boudreaux/actions/workflows/ci.yml/badge.svg)](https://github.com/braveneworg/boudreaux/actions/workflows/ci.yml)
[![Deploy](https://github.com/braveneworg/boudreaux/actions/workflows/deploy.yml/badge.svg)](https://github.com/braveneworg/boudreaux/actions/workflows/deploy.yml)
[![codecov](https://codecov.io/gh/braveneworg/boudreaux/branch/main/graph/badge.svg)](https://codecov.io/gh/braveneworg/boudreaux)
[![License](https://img.shields.io/github/license/braveneworg/boudreaux)](LICENSE)
[![Node Version](https://img.shields.io/badge/node-22.x-brightgreen.svg)](package.json)
[![Next.js](https://img.shields.io/badge/Next.js-15.5.0-black)](https://nextjs.org)

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

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
