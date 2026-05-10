# boudreaux Development Guidelines

Auto-generated from all feature plans. Last updated: 2026-05-06

## Active Technologies

- TypeScript 6 (strict), Node 24 + Next.js 16 (App Router, Turbopack dev), React 19, Auth.js v5, Prisma 6 (MongoDB), AWS SDK v3 (S3), `archiver`, React Hook Form 7, Zod 4, TanStack Query 5, shadcn/ui (Radix), Tailwind v4, lucide-reac (007-free-digital-downloads)
- MongoDB via Prisma (`DownloadEvent`, `GuestDownloadCount`, `UserDownloadQuota` already exist); S3 for media + bundle cache (`tmp/bundles/cache/{releaseId}/{sortedFormatKey}.zip`) (007-free-digital-downloads)

- TypeScript 5.x (strict mode) with Next.js 16.1.6+ + React 18+, Prisma 6.x (MongoDB adapter), Auth.js (NextAuth), AWS SDK (S3), Tailwind CSS v4, shadcn/ui, Zod, React Hook Form, Tanstack Query (002-tour-management)
- MongoDB (via Prisma ORM) for data persistence, AWS S3 for image/file storage (002-tour-management)

- TypeScript 5.9.3 (strict mode enabled) + `cmdk` (Command/combobox), `embla-carousel-react` (Carousel), `video.js` (audio playback via MediaPlayer), `lucide-react` (icons), `next/image` (optimized images), `@tanstack/react-query` (client-side data fetching) (001-release-search-player)

- TypeScript 6 (strict) + Next.js 16, React 19, Prisma 6 (MongoDB), AWS SDK S3 v3, archiver, Auth.js v5, Tailwind v4, shadcn/ui, RHF 7, Zod 4 — guest-mode bundle download via HTTP-only `boudreaux_visitor_id` cookie + `DownloadSubject` discriminated union (007-free-digital-downloads)

## Project Structure

```text
src/
tests/
```

## Commands

pnpm test && pnpm run lint

## Code Style

TypeScript 5.9.3 (strict mode enabled): Follow standard conventions

## Recent Changes

- 007-free-digital-downloads: Added TypeScript 6 (strict), Node 24 + Next.js 16 (App Router, Turbopack dev), React 19, Auth.js v5, Prisma 6 (MongoDB), AWS SDK v3 (S3), `archiver`, React Hook Form 7, Zod 4, TanStack Query 5, shadcn/ui (Radix), Tailwind v4, lucide-reac

- 007-free-digital-downloads: Wire up free MP3 320 + AAC bundle downloads for guests via existing bundle SSE endpoint (`mode=free`); introduce `boudreaux_visitor_id` HTTP-only cookie and `DownloadSubject` discriminated union to extend `QuotaEnforcementService` and `PurchaseService.getDownloadAccess` to non-authenticated visitors

- 002-tour-management: Added TypeScript 5.x (strict mode) with Next.js 16.1.6+ + React 18+, Prisma 6.x (MongoDB adapter), Auth.js (NextAuth), AWS SDK (S3), Tailwind CSS v4, shadcn/ui, Zod, React Hook Form, Tanstack Query

<!-- MANUAL ADDITIONS START -->
<!-- MANUAL ADDITIONS END -->
