# Quickstart: Banner & Notification Carousel

**Branch**: `006-banner-notification-carousel` | **Date**: 2026-04-07

## Prerequisites

- Node.js 20+ and pnpm installed
- MongoDB instance running (Prisma connection via `DATABASE_URL`)
- CDN domain configured (`NEXT_PUBLIC_CDN_DOMAIN` env var)
- Banner images uploaded to S3 bucket under `media/banners/`:
  - `FFINC Banner 1_5_1920.webp`
  - `FFINC Banner 2_5_1920.webp`
  - `FFINC Banner 3_5_1920.webp`
  - `FFINC Banner 4_5_1920.webp`
  - `FFINC Banner 5_5_1920.webp`

## Setup

```bash
# 1. Switch to feature branch
git checkout 006-banner-notification-carousel

# 2. Install dependencies (no new deps expected)
pnpm install

# 3. Push schema changes to MongoDB
pnpm exec prisma db push

# 4. Generate Prisma client
pnpm exec prisma generate

# 5. Start dev server
pnpm run dev
```

## Verify

1. **Public carousel**: Navigate to `http://localhost:3000`. You should see
   5 banner images rotating with counter-slide animation. Any slots with
   active notifications show a text strip above the banner.

2. **Admin panel**: Navigate to `http://localhost:3000/admin/notifications`
   (requires admin login). You should see 5 banner slots with CDN image
   thumbnails. Click any slot to add/edit notification text, colors, and
   date range.

3. **Repost search**: In any slot's edit form, click the "Repost notification"
   combobox. Type to search past notifications. Select one to populate fields.

## Key Commands

```bash
pnpm run test:run          # Run all tests
pnpm run lint              # ESLint check
pnpm run format            # Prettier format
pnpm run build             # Production build
pnpm exec prisma studio    # Browse database
```

## Environment Variables

| Variable                      | Description                                                        | Required |
| ----------------------------- | ------------------------------------------------------------------ | -------- |
| `DATABASE_URL`                | MongoDB connection string                                          | Yes      |
| `NEXT_PUBLIC_CDN_DOMAIN`      | CloudFront domain (e.g., `cdn.fakefourrecords.com`)                | Yes      |
| `CDN_DOMAIN`                  | CloudFront domain used by `cloudfrontLoader` (same value as above) | Yes      |
| `NEXT_PUBLIC_BANNER_INTERVAL` | Default rotation interval in ms (fallback: 6500)                   | No       |

## File Structure (New/Modified)

```text
prisma/
└── schema.prisma              # + BannerNotification model, User relation update

src/
├── app/
│   ├── page.tsx               # Modified: uses BannerCarousel instead of NotificationBanner
│   ├── api/
│   │   └── notification-banners/
│   │       ├── route.ts       # GET: public banner data
│   │       └── search/
│   │           └── route.ts   # GET: admin search for repost
│   ├── admin/
│   │   └── notifications/
│   │       └── page.tsx       # Replaced: 5 banner slot management
│   └── components/
│       └── banner-carousel.tsx # New: public carousel component
├── lib/
│   ├── actions/
│   │   └── banner-notification-action.ts  # New: CRUD server actions
│   ├── services/
│   │   └── banner-notification-service.ts # New: data access + caching
│   ├── validation/
│   │   └── banner-notification-schema.ts  # New: Zod schemas
│   └── constants/
│       └── banner-slots.ts    # New: 5 banner image filenames
```
