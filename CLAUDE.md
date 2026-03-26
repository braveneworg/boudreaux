# boudreaux Development Guidelines

Auto-generated from all feature plans. Last updated: 2026-03-23

## Active Technologies

- TypeScript 5+ (strict mode) + Next.js 16 (App Router), React 18, Stripe 20, Prisma 5 (MongoDB), Auth.js, AWS SES, shadcn/ui, Zod, React Hook Form (001-release-search-player)
- TypeScript 5+ (strict mode) + Next.js 16 (App Router), React 18, Prisma 5 (MongoDB), Auth.js, shadcn/ui, Zod, React Hook Form (002-tour-management)
- TypeScript 5+ (strict mode) + Next.js 16 (App Router), React 18, Stripe 20 (payment mode), Prisma 5 (MongoDB), Auth.js, AWS SES, shadcn/ui, Zod, React Hook Form (003-stripe-pwyw-purchase)
- TypeScript 5+ (strict mode) + Next.js 16 (App Router), React 18, Prisma 5 (MongoDB), AWS SDK S3 v3 (presigned URLs), Auth.js, shadcn/ui (Accordion), Zod, React Hook Form (004-release-digital-formats)
- MongoDB via Prisma (003-stripe-pwyw-purchase, 004-release-digital-formats)
- AWS S3 (presigned URLs for upload/download, 24hr expiration for downloads, 15min for uploads) (004-release-digital-formats)

## Project Structure

```text
src/
├── app/               # Next.js App Router pages, layouts, and API routes
│   ├── api/           # API routes (GET queries; Stripe webhook)
│   ├── components/    # Shared feature components
│   ├── (auth)/        # Auth-gated routes
│   ├── admin/         # Admin pages
│   └── releases/      # Release pages and media player
├── lib/
│   ├── actions/       # Server Actions (mutations)
│   ├── email/         # Email templates and SES dispatch
│   ├── repositories/  # Prisma data-access layer
│   ├── services/      # Business logic services
│   ├── utils/         # Utilities (auth, rate-limiting, SES client, Stripe client)
│   └── validation/    # Zod schemas
prisma/
└── schema.prisma      # MongoDB schema
```

## Commands

```bash
pnpm run dev          # Start development server
pnpm run build        # Production build
pnpm run test:run     # Run all tests once
pnpm run test:coverage # Coverage report (target 90–95%)
pnpm run lint         # ESLint check and auto-fix
pnpm run format       # Prettier format
pnpm exec prisma db push   # Push schema changes to MongoDB
pnpm exec prisma studio    # Browse database
stripe listen --forward-to http://localhost:3000/api/stripe/webhook  # Local webhook forwarding
```

## Code Style

TypeScript: Follow standard TypeScript conventions; strict mode enabled; no `any` types; explicit types on all function parameters and return values; `interface` for object shapes; named exports only.

Next.js: Server Components by default; `'use client'` only for interactive components (Stripe Elements, dialogs); Server Actions for mutations; API routes for queries.

Testing: Vitest + `@testing-library/react`; `.spec.ts` files adjacent to source; `describe`/`it` blocks; 90–95%+ coverage target; mock external dependencies (Stripe, SES, Prisma).

## Recent Changes

- 004-release-digital-formats: Added digital format management (ReleaseDigitalFormat, UserDownloadQuota, DownloadEvent models), S3 presigned URL upload/download (24hr download expiration, 15min upload), freemium 5-download quota with unique release tracking, soft delete with 90-day grace period, admin accordion UI with checkmark indicators, download authorization API with purchase/quota checks, format-specific file validation (MP3/AAC 100MB, FLAC 250MB, WAV 500MB)
- 003-stripe-pwyw-purchase: Added Stripe payment-mode checkout, PWYW purchase dialog, download gate API, purchase/download tracking models, SES purchase confirmation email
- 002-tour-management: Added tour management (Tour, TourDate, Venue models), admin CRUD, public tour listings
- 001-release-search-player: Added release search combobox, release media player page, artist carousel, breadcrumb navigation

<!-- MANUAL ADDITIONS START -->
<!-- MANUAL ADDITIONS END -->
