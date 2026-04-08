# Research: Banner & Notification Carousel

**Branch**: `006-banner-notification-carousel` | **Date**: 2026-04-07

## R1: Data Model Strategy — Adapt Existing vs. New Model

**Decision**: Create a new simplified `NotificationBanner` model and deprecate the
existing `Notification` model.

**Rationale**: The existing `Notification` model has 42 fields (image cropping,
text overlay positioning, font sizing, shadows, rotation, secondary messages)
that are entirely unnecessary for the new feature. The new feature needs only:
rich text content, text color, background color, start/end dates, slot
assignment, and a repost reference. Adapting the existing model would leave 30+
unused fields, violating code quality principles and creating confusion.

**Alternatives considered**:

- **Adapt existing model**: Would leave 30+ dead fields; every query/form would
  need to ignore them; migration risk if old data is still referenced.
- **Subset via Prisma views**: MongoDB doesn't support views natively in Prisma;
  Prisma `select` can limit fields but the schema remains bloated.

**Migration path**: The existing `Notification` collection and its data are
preserved. The new `NotificationBanner` model coexists. The existing admin pages,
service, actions, and form are replaced entirely (per FR-018). The old
`Notification` model can be removed in a future cleanup once the feature is
stable.

---

## R2: Animation Library — Framer Motion

**Decision**: Use Framer Motion (`framer-motion ^12.23.28`) for all carousel
animations (both banner image transitions and notification strip transitions).

**Rationale**: User explicitly requested Framer Motion. The existing
`notification-banner.tsx` already uses Framer Motion with `AnimatePresence`,
directional slide variants, drag support, and tween transitions. This is a
proven pattern in the codebase.

**Key patterns to reuse**:

- `AnimatePresence` with `mode="popLayout"` and `custom={direction}`
- Directional variants: `enter: (dir) => ({ x: dir * 100% })`, `exit: (dir) =>
({ x: dir * -100% })`
- Counter-slide: banner uses `dir * 100%` while notification uses `dir * -100%`
  (opposite x direction)
- `drag="x"` with `dragElastic`, `dragConstraints`, `onDragEnd` for swipe
- Tween transition: ~0.4s duration with custom easing

**Alternatives considered**:

- **Embla Carousel**: Available in the project (`embla-carousel-react ^8.6.0`)
  but doesn't support counter-slide (opposing direction) animation natively.
  Would require two separate embla instances synced together, adding complexity.
- **CSS transitions**: Insufficient for the counter-slide mirror effect with
  direction tracking and drag gestures.

---

## R3: Image Component Strategy

**Decision**: Use `next/image` `<Image>` component with the existing
`cloudfrontLoader` from `@/lib/utils/cloudfront-loader`. The loader constructs
CDN URLs with width/quality params: `${CDN_DOMAIN}/media/banners/${src}?w=${width}&q=${quality}&f=webp`.

**Rationale**: User explicitly requested `next/image` with `cloudfrontLoader`.
The loader already exists at `src/lib/utils/cloudfront-loader.ts` and generates
responsive CDN URLs with width-based optimization. The `next.config.ts` has
`remotePatterns` for `cdn.fakefourrecords.com`. Using the custom loader ensures
images are served at the right size for each viewport (min 360px mobile).

**`cloudfrontLoader` implementation** (already exists):

```typescript
export const cloudfrontLoader = ({ src, width, quality }: ImageLoaderProps): string => {
  return `${process.env.CDN_DOMAIN}/media/banners/${src}?w=${width}&q=${quality || 80}&f=webp`;
};
```

**Image component usage**:

```tsx
<Image
  loader={cloudfrontLoader}
  src="FFINC Banner 1_5_1920.webp" // just the filename
  alt="Banner 1"
  fill
  sizes="(min-width: 360px) 100vw"
  priority={isFirst}
/>
```

**Banner image filenames** (all 5 confirmed, in `/media/banners/` on CDN):

1. `FFINC Banner 1_5_1920.webp`
2. `FFINC Banner 2_5_1920.webp`
3. `FFINC Banner 3_5_1920.webp`
4. `FFINC Banner 4_5_1920.webp`
5. `FFINC Banner 5_5_1920.webp`

**Responsive sizing**: The `sizes` prop ensures the browser requests the
appropriate image width. At 360px minimum viewport, the `100vw` sizes hint
tells Next.js to generate a 360px-wide variant. At larger viewports, wider
variants are served automatically. The `_1920` suffix indicates the source
image is 1920px wide.

**Note**: The `cloudfrontLoader` uses `process.env.CDN_DOMAIN` (server-side
env var). Since `<Image>` with a custom loader runs on the client, the CDN
domain must be available as `NEXT_PUBLIC_CDN_DOMAIN` or the loader must be
updated to use the public env var. This is a known consideration for
implementation.

---

## R4: Notification Combobox — Repost Pattern

**Decision**: Follow the `ReleaseSelect` server-side search pattern with
`shouldFilter={false}` and debounced API fetch.

**Rationale**: The project has an established pattern for searchable comboboxes
with server-side filtering. `ReleaseSelect` uses `Popover + Command` from cmdk
with `shouldFilter={false}`, 300ms debounced search, lazy-loading on popover
open, and loading/error states. The `VenueSelect` follows the same pattern.
This is the cleanest fit for searching past notifications.

**API endpoint**: New `GET /api/notification-banners?search=...` route that
queries by notification text content, returning matching past notifications.

**Alternatives considered**:

- **Client-side filtering**: Would require loading all past notifications
  upfront; doesn't scale and adds unnecessary payload.
- **Basic `ComboboxField`**: Uses client-side `shouldFilter` which requires all
  options in memory; not suitable for potentially large notification history.

---

## R5: HTML Sanitization — XSS Prevention

**Decision**: Sanitize on save (server-side) using a lightweight HTML sanitizer
that allowlists `<strong>`, `<em>`, and `<a>` tags. The `<a>` tag allows only
the `href` attribute. At render time, add `target="_blank"` and
`rel="noopener noreferrer"` to all `<a>` tags.

**Rationale**: FR-007 and FR-008 require strict tag/attribute allowlisting.
Sanitizing on save (not just on render) ensures no XSS vectors are stored in
the database, satisfying SC-003.

**Implementation approach**: Use `sanitize-html` or a minimal custom sanitizer
with Zod `.transform()` in the validation schema. The sanitizer strips all tags
except `<strong>`, `<em>`, `<a>`. On `<a>`, only `href` is preserved. This
runs in the server action before Prisma write.

**Dependency check**: `sanitize-html` is not in `package.json`. Evaluate whether
a lightweight custom function (regex-based or DOM parser) is sufficient given
the very small allowlist, avoiding a new dependency. A simple approach using
`DOMParser` (server-side via JSDOM or a tagged-template approach) may suffice.

---

## R6: Carousel Configuration Storage

**Decision**: Store the rotation interval as a field on a `SiteSettings` or
dedicated `CarouselConfig` entry in the database, fetched alongside banner data.

**Rationale**: FR-020 requires admin-configurable rotation interval (default 6.5s,
range 3-15s). The current system uses `NEXT_PUBLIC_BANNER_INTERVAL` env var
(hardcoded at build time). Moving to a DB-stored value allows runtime admin
changes without redeployment.

**Implementation**: Add a `rotationInterval` field to the banner query response.
The service returns the interval along with the banner data. The client
component reads it from props.

**Alternatives considered**:

- **Env var**: Current approach; can't be changed by admin at runtime.
- **Dedicated `CarouselConfig` model**: Overkill for a single field; a simpler
  `SiteSettings` singleton or a field on the API response suffices.
- **Store on each notification**: Redundant; it's a global setting, not per-slot.

---

## R7: Tab Visibility Behavior

**Decision**: Use `document.visibilitychange` event to pause notification strip
animation when the tab is hidden, while allowing banner auto-rotation to
continue.

**Rationale**: FR-020 specifies this split behavior. The banner continues
cycling (the timer keeps running) so when the user returns, they see the
current banner position. The notification strip pauses its animation to avoid
wasted rendering and out-of-sync visual state. On tab return, the notification
strip re-syncs to match the current banner position.

**Implementation**: Two separate animation states — banner index advances on the
timer regardless of visibility; notification strip animation is conditionally
rendered/paused based on `document.hidden`.

---

## R8: Existing Codebase Replacement Scope

**Decision**: Replace the following files/components entirely:

| Current File                                                           | Replacement                                                |
| ---------------------------------------------------------------------- | ---------------------------------------------------------- |
| `src/app/components/notification-banner.tsx` (448 lines)               | New banner carousel component with counter-slide animation |
| `src/app/components/forms/notification-banner-form.tsx` (2,382 lines)  | New simplified form (~300-400 lines) for 5 banner slots    |
| `src/lib/actions/notification-banner-action.ts` (678 lines)            | New simplified server actions for banner-notification CRUD |
| `src/lib/services/notification-banner-service.ts` (328 lines)          | New service for banner-notification pairs                  |
| `src/lib/validation/notification-banner-schema.ts` (210 lines)         | New simplified Zod schema                                  |
| `src/app/admin/notifications/page.tsx`                                 | New admin page showing 5 banner slots                      |
| `src/app/admin/notifications/notification-banner-list.tsx` (370 lines) | Replaced by inline slot management                         |
| `src/app/admin/notifications/new/page.tsx`                             | No longer needed (slots are fixed)                         |
| `src/app/admin/notifications/[notificationId]/page.tsx`                | No longer needed (edit inline)                             |
| `src/lib/actions/process-notification-image-action.ts` (493 lines)     | Not needed (no image processing)                           |

**Preserved**:

- `prisma/schema.prisma` `Notification` model — kept for data preservation
- `src/lib/utils/simple-cache.ts` — reused for new service caching
- `src/lib/utils/cdn-url.ts` — reused for banner image URLs
- API routes pattern — new routes follow same conventions

**Net reduction**: ~4,900+ lines of complex code replaced with ~1,500-2,000
lines of focused, simpler code.
