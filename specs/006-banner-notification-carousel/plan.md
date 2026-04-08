# Implementation Plan: Banner & Notification Carousel

**Branch**: `006-banner-notification-carousel` | **Date**: 2026-04-07 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/006-banner-notification-carousel/spec.md`

## Summary

Replace the existing 42-field notification banner system with a simplified
banner-notification carousel. The public-facing component displays 5 fixed CDN
banner images with optional notification text strips, animated using Framer
Motion with a counter-slide (mirror) transition. The admin interface is
replaced with a streamlined 5-slot management page. The new data model has
13 fields instead of 42, reducing codebase complexity by ~3,000+ lines.

## Technical Context

**Language/Version**: TypeScript 6.0+ (strict mode)
**Framework**: Next.js 16+ (App Router), React 19
**Primary Dependencies**: Framer Motion ^12.23.28 (animations), cmdk ^1.1.1
(combobox), next/image with `cloudfrontLoader` (banner images), Zod ^4.1.13
(validation), React Hook Form ^7.63.0 (admin forms), shadcn/ui (UI components),
date-fns ^4.1.0 (date formatting)
**Storage**: MongoDB via Prisma ^6.16.3
**Testing**: Vitest ^4.0.18 with @testing-library/react
**Target Platform**: Web (desktop + mobile, min viewport 360px)
**Project Type**: Web application (Next.js App Router)
**Styling**: Tailwind v4 utility classes (primary), `globals.css` (if custom CSS
needed). Native HTML `<input type="color">` for color pickers. Existing
`DatePicker` component from `@/app/components/ui/datepicker`.
**Performance Goals**: First banner visible <1s, swipe response <100ms, smooth
60fps animations
**Constraints**: 5 fixed banner images (CDN), XSS-safe HTML subset only,
admin-configurable rotation (3-15s)
**Scale/Scope**: 5 banner slots, ~15 files modified/created

## Constitution Check

_GATE: Must pass before Phase 0 research. Re-check after Phase 1 design._

| Principle           | Status | Notes                                                                                                                            |
| ------------------- | ------ | -------------------------------------------------------------------------------------------------------------------------------- |
| I. TypeScript-First | PASS   | All new code in TS strict mode; explicit types on all functions                                                                  |
| II. Next.js & React | PASS   | Server Components default; `'use client'` only for carousel + admin form; Server Actions for mutations; API routes for GET       |
| III. TDD            | PASS   | Tests written alongside implementation per spec                                                                                  |
| IV. Security        | PASS   | HTML sanitization on save (FR-007/008); admin auth via `requireRole`; Zod validation on all inputs                               |
| V. Performance      | PASS   | Framer Motion for smooth animations; next/image optimization; server-side caching (5min TTL); `sizes` prop for responsive images |
| VI. Code Quality    | PASS   | Named exports; absolute imports; `cn()` for classes; ~3k line net reduction                                                      |
| VII. Accessibility  | PASS   | `aria-roledescription="carousel"`; keyboard nav (ArrowLeft/Right); semantic HTML; focus management                               |

No violations. No complexity tracking entries needed.

## Project Structure

### Documentation (this feature)

```text
specs/006-banner-notification-carousel/
├── plan.md              # This file
├── spec.md              # Feature specification
├── research.md          # Phase 0: technology decisions
├── data-model.md        # Phase 1: BannerNotification model
├── quickstart.md        # Phase 1: setup guide
├── contracts/
│   └── api-contracts.md # Phase 1: API and component contracts
└── checklists/
    └── requirements.md  # Spec quality checklist
```

### Source Code (repository root)

```text
prisma/
└── schema.prisma                          # + BannerNotification model, User relation

src/
├── app/
│   ├── page.tsx                           # MODIFY: BannerCarousel replaces NotificationBanner
│   ├── api/
│   │   └── notification-banners/
│   │       ├── route.ts                   # NEW: GET public banner data (all 5 slots + interval)
│   │       └── search/
│   │           └── route.ts               # NEW: GET admin notification search (repost combobox)
│   ├── admin/
│   │   └── notifications/
│   │       ├── page.tsx                   # REPLACE: 5-slot banner management page
│   │       ├── banner-slot-card.tsx       # NEW: individual slot card with inline edit
│   │       ├── notification-search.tsx    # NEW: repost combobox (Popover+Command)
│   │       └── rotation-interval-form.tsx # NEW: global interval setting
│   └── components/
│       └── banner-carousel.tsx            # NEW: public carousel (Framer Motion)
├── lib/
│   ├── actions/
│   │   └── banner-notification-action.ts  # NEW: upsert, delete, update interval actions
│   ├── services/
│   │   └── banner-notification-service.ts # NEW: data access + caching
│   ├── validation/
│   │   └── banner-notification-schema.ts  # NEW: Zod schemas + HTML sanitizer
│   └── constants/
│       └── banner-slots.ts               # NEW: 5 banner filenames + CDN path
```

**Structure Decision**: Single Next.js project (existing structure). New files
follow existing patterns: services in `lib/services/`, actions in
`lib/actions/`, validation in `lib/validation/`, components co-located with
their routes.

### Removed/Deprecated Files

These files are replaced by the new implementation. They should be removed once
the feature is stable:

| File                                                       | Lines | Replaced By                                             |
| ---------------------------------------------------------- | ----- | ------------------------------------------------------- |
| `src/app/components/forms/notification-banner-form.tsx`    | 2,382 | `admin/notifications/banner-slot-card.tsx` (~200 lines) |
| `src/app/admin/notifications/notification-banner-list.tsx` | 370   | Inline in `admin/notifications/page.tsx`                |
| `src/app/admin/notifications/new/page.tsx`                 | ~30   | Not needed (slots are fixed)                            |
| `src/app/admin/notifications/[notificationId]/page.tsx`    | ~30   | Not needed (inline edit)                                |
| `src/lib/actions/process-notification-image-action.ts`     | 493   | Not needed (no image processing)                        |
| `src/app/components/notification-banner.tsx`               | 448   | `components/banner-carousel.tsx` (~250 lines)           |
| `src/lib/actions/notification-banner-action.ts`            | 678   | `actions/banner-notification-action.ts` (~150 lines)    |
| `src/lib/services/notification-banner-service.ts`          | 328   | `services/banner-notification-service.ts` (~150 lines)  |
| `src/lib/validation/notification-banner-schema.ts`         | 210   | `validation/banner-notification-schema.ts` (~80 lines)  |

**Net change**: ~4,969 lines removed → ~830 lines added = **~4,100 lines net reduction**

## Key Design Decisions

### 1. New Model vs. Adapting Existing

Create a new `BannerNotification` model (13 fields) rather than adapting the
42-field `Notification` model. See [research.md](./research.md#r1) for full
rationale.

### 2. Counter-Slide Animation

Two separate `motion.div` containers:

- **Notification strip**: slides `x: dir * -100%` → `x: 0` (opposite direction)
- **Banner image**: slides `x: dir * 100%` → `x: 0` (forward direction)

Both wrapped in a shared `AnimatePresence` with the same `direction` custom
prop and keyed by `currentIndex`. The strip conditionally renders based on
whether the current slot has an active notification.

### 3. Tab Visibility Split

Use `useEffect` with `document.visibilitychange`:

- Banner timer continues running when hidden (index advances)
- Notification strip animation pauses (doesn't render transitions while hidden)
- On tab focus: strip re-syncs to current banner index

### 4. HTML Sanitization

Custom sanitizer function in the Zod schema `.transform()`:

- Parse HTML string
- Walk DOM nodes, remove any element not in `['strong', 'em', 'a']`
- On `<a>` elements, remove all attributes except `href`
- Serialize back to string
- At render time, add `target="_blank"` and `rel="noopener noreferrer"` to `<a>` tags

This avoids adding `sanitize-html` as a dependency (30+ transitive deps) for
a 3-tag allowlist.

### 5. Banner Slot Constants

The 5 banner filenames are defined as a TypeScript `as const` array in
`src/lib/constants/banner-slots.ts`. They are not stored in the database.
The `BannerNotification` model's `slotNumber` (1-5) maps to the array index.

### 6. Image Loading via `cloudfrontLoader`

Banner images use the existing `cloudfrontLoader` from
`@/lib/utils/cloudfront-loader` as the `loader` prop on `next/image`:

```tsx
<Image
  loader={cloudfrontLoader}
  src="FFINC Banner 1_5_1920.webp"
  alt="Banner 1"
  fill
  sizes="(min-width: 360px) 100vw"
  priority={isFirst}
  className="object-cover"
/>
```

The loader generates responsive CDN URLs:
`${CDN_DOMAIN}/media/banners/${src}?w=${width}&q=${quality}&f=webp`

**Note**: The loader uses `process.env.CDN_DOMAIN`. Since `<Image>` with a
custom loader runs on the client, verify the env var is available client-side
(or update to use `NEXT_PUBLIC_CDN_DOMAIN`).

### 7. Styling Strategy

- **Tailwind v4 classes** for all layout, spacing, colors, typography,
  responsive breakpoints. Use `cn()` for conditional class composition.
- **`globals.css`** only if custom keyframes or CSS that can't be expressed
  in Tailwind are needed (e.g., complex animation timing functions).
- **Native `<input type="color">`** for the text color and background color
  pickers in the admin form. No custom color picker library.
- **Existing `DatePicker`** component from `@/app/components/ui/datepicker`
  for `displayFrom` and `displayUntil` fields. Props: `onSelect`, `fieldName`,
  `value` (ISO string).
- **No new dependencies** needed beyond what's in `package.json`.

### 8. Rotation Interval Storage

For MVP, use a `SiteSettings` model with a `carousel-rotation-interval` key.
The service reads this value and includes it in the public API response.
Default fallback: 6.5 seconds.

## Implementation Order

1. **Schema & Constants** (foundation)
   - Add `BannerNotification` model to Prisma schema
   - Add `bannerNotifications` relation to User model
   - Create `banner-slots.ts` constants
   - Push schema to MongoDB

2. **Validation & Sanitization** (foundation)
   - Create Zod schema with HTML sanitizer transform
   - Hex color validation, date range validation

3. **Service Layer** (foundation)
   - `BannerNotificationService` with CRUD + cached active query
   - Follow `withCache` pattern from existing service

4. **Server Actions** (depends on 2, 3)
   - Upsert, delete, update interval actions
   - Auth via `requireRole('admin')`

5. **API Routes** (depends on 3)
   - `GET /api/notification-banners` (public)
   - `GET /api/notification-banners/search` (admin)

6. **Public Carousel Component** (depends on 5)
   - Framer Motion counter-slide animation
   - Touch swipe, keyboard nav, auto-rotation
   - Tab visibility handling
   - Conditional notification strip

7. **Home Page Integration** (depends on 6)
   - Replace `<NotificationBanner>` with `<BannerCarousel>`
   - Update data fetching in `page.tsx`

8. **Admin Interface** (depends on 4, 5)
   - 5-slot card layout with inline edit
   - Notification repost combobox
   - Rotation interval form
   - Replace existing admin pages

9. **Cleanup** (depends on 6, 7, 8)
   - Remove deprecated files
   - Remove unused API routes
   - Update imports
