# boudreaux Development Guidelines

Auto-generated from all feature plans. Last updated: 2026-03-21

## Active Technologies

- TypeScript 5+ (strict mode) + Next.js 16 (App Router), React 18, Stripe 20, Prisma 5 (MongoDB), Auth.js, AWS SES, shadcn/ui, Zod, React Hook Form (001-release-search-player)
- TypeScript 5+ (strict mode) + Next.js 16 (App Router), React 18, Prisma 5 (MongoDB), Auth.js, shadcn/ui, Zod, React Hook Form (002-tour-management)
- TypeScript 5+ (strict mode) + Next.js 16 (App Router), React 18, Stripe 20 (payment mode), Prisma 5 (MongoDB), Auth.js, AWS SES, shadcn/ui, Zod, React Hook Form (003-stripe-pwyw-purchase)
- MongoDB via Prisma (003-stripe-pwyw-purchase)

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
npm run dev          # Start development server
npm run build        # Production build
npm run test:run     # Run all tests once
npm run test:coverage # Coverage report (target 90–95%)
npm run lint         # ESLint check
npm run lint:fix     # Auto-fix lint issues
npm run format       # Prettier format
npx prisma db push   # Push schema changes to MongoDB
npx prisma studio    # Browse database
stripe listen --forward-to http://localhost:3000/api/stripe/webhook  # Local webhook forwarding
```

## Code Style

TypeScript: Follow standard TypeScript conventions; strict mode enabled; no `any` types; explicit types on all function parameters and return values; `interface` for object shapes; named exports only.

Next.js: Server Components by default; `'use client'` only for interactive components (Stripe Elements, dialogs); Server Actions for mutations; API routes for queries.

Testing: Vitest + `@testing-library/react`; `.spec.ts` files adjacent to source; `describe`/`it` blocks; 90–95%+ coverage target; mock external dependencies (Stripe, SES, Prisma).

## Recent Changes

- 003-stripe-pwyw-purchase: Added Stripe payment-mode checkout, PWYW purchase dialog, download gate API, purchase/download tracking models, SES purchase confirmation email
- 002-tour-management: Added tour management (Tour, TourDate, Venue models), admin CRUD, public tour listings
- 001-release-search-player: Added release search combobox, release media player page, artist carousel, breadcrumb navigation

<!-- MANUAL ADDITIONS START -->
<!-- MANUAL ADDITIONS END -->
