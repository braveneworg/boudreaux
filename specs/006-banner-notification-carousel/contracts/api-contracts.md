# API Contracts: Banner & Notification Carousel

**Branch**: `006-banner-notification-carousel` | **Date**: 2026-04-07

## Public Endpoints

### GET /api/notification-banners

Returns all 5 banner slots with their active notifications for the current date.

**Auth**: None (public)

**Response** `200 OK`:

```json
{
  "banners": [
    {
      "slotNumber": 1,
      "imageFilename": "FFINC Banner 1_5_1920.webp",
      "notification": {
        "id": "6651a...",
        "content": "<strong>New Release</strong> — <a href=\"/releases/abc\">Listen Now</a>",
        "textColor": "#ffffff",
        "backgroundColor": "#1a1a2e",
        "displayFrom": "2026-04-10T00:00:00.000Z",
        "displayUntil": "2026-04-20T23:59:59.999Z"
      }
    },
    {
      "slotNumber": 2,
      "imageFilename": "FFINC Banner 2_5_1920.webp",
      "notification": null
    },
    {
      "slotNumber": 3,
      "imageFilename": "FFINC Banner 3_5_1920.webp",
      "notification": null
    },
    {
      "slotNumber": 4,
      "imageFilename": "FFINC Banner 4_5_1920.webp",
      "notification": null
    },
    {
      "slotNumber": 5,
      "imageFilename": "FFINC Banner 5_5_1920.webp",
      "notification": null
    }
  ],
  "rotationInterval": 6.5
}
```

**Notes**:

- Always returns exactly 5 banner objects, ordered by slotNumber
- `notification` is `null` if no notification exists for the slot or the current
  date is outside displayFrom/displayUntil
- `rotationInterval` is in seconds (default 6.5)
- Response is cached server-side (5 min TTL, day-granularity key)
- No `imageUrl` field — the client uses `cloudfrontLoader` with the `imageFilename`
  to construct responsive CDN URLs at the appropriate width

---

### GET /api/notification-banners/search?q={query}

Search past notifications for the repost combobox.

**Auth**: Admin role required

**Query params**:

- `q` (string, optional): Search term to filter by content text
- `take` (number, optional, default 20): Max results to return

**Response** `200 OK`:

```json
{
  "notifications": [
    {
      "id": "6651a...",
      "content": "<strong>Tour Announcement</strong>",
      "textColor": "#ff0000",
      "backgroundColor": "#000000",
      "slotNumber": 3,
      "createdAt": "2026-03-15T10:00:00.000Z"
    }
  ]
}
```

**Response** `401 Unauthorized`:

```json
{ "error": "Unauthorized" }
```

---

## Admin Server Actions

### createOrUpdateBannerNotificationAction

**Type**: Server Action (via `useActionState`)

**Input**: `FormData` with fields:

- `slotNumber` (required, 1-5)
- `content` (optional, max 500 chars, HTML sanitized on save)
- `textColor` (optional, hex color)
- `backgroundColor` (optional, hex color)
- `displayFrom` (optional, ISO date string)
- `displayUntil` (optional, ISO date string)
- `repostedFromId` (optional, ObjectId string)

**Behavior**: Upserts the `BannerNotification` record for the given slotNumber.
If no record exists for the slot, creates one. If a record exists, updates it.

**Auth**: Admin role required

**Response** (`FormState`):

```typescript
// Success
{ success: true, fields: {}, data: { notificationId: "6651a..." } }

// Validation error
{ success: false, fields: {}, errors: { content: ["Content exceeds 500 characters"] } }

// Auth error
{ success: false, fields: {}, errors: { _form: ["Unauthorized"] } }
```

**Revalidation**: `revalidatePath('/')`, `revalidatePath('/admin/notifications')`

---

### deleteBannerNotificationAction

**Type**: Server Action (direct call, not useActionState)

**Input**: `slotNumber: number` (1-5)

**Behavior**: Deletes the `BannerNotification` record for the given slot,
effectively clearing the notification. The banner image continues to display.

**Auth**: Admin role required

**Response**:

```typescript
{ success: true } | { success: false, error: "Not found" }
```

**Revalidation**: `revalidatePath('/')`, `revalidatePath('/admin/notifications')`

---

### updateRotationIntervalAction

**Type**: Server Action (direct call)

**Input**: `interval: number` (3-15, whole seconds)

**Auth**: Admin role required

**Response**:

```typescript
{ success: true } | { success: false, error: "Invalid interval" }
```

**Revalidation**: `revalidatePath('/')`

---

## Component Contracts

### BannerCarousel (Public Component)

**File**: `src/app/components/banner-carousel.tsx` (`'use client'`)

**Image rendering**: Uses `next/image` with `cloudfrontLoader` from
`@/lib/utils/cloudfront-loader`. The `src` prop is the bare filename (e.g.,
`"FFINC Banner 1_5_1920.webp"`), and the loader constructs the full CDN URL.
`sizes="(min-width: 360px) 100vw"` for responsive loading.

**Animation**: Framer Motion `AnimatePresence` + `motion.div` with counter-slide
variants. Banner slides `x: dir * 100%`, notification strip slides
`x: dir * -100%`.

**Styling**: Tailwind v4 utility classes. Notification strip has ~1px white
space above and below (e.g., `py-px` or `border-y border-white`).

**Props**:

```typescript
interface BannerCarouselProps {
  banners: BannerSlotData[];
  rotationInterval?: number; // seconds, default 6.5
  className?: string;
}

interface BannerSlotData {
  slotNumber: number;
  imageFilename: string; // bare filename for cloudfrontLoader src
  notification: {
    id: string;
    content: string;
    textColor: string | null;
    backgroundColor: string | null;
  } | null;
}
```

### BannerSlotCard (Admin Component)

**File**: `src/app/admin/notifications/banner-slot-card.tsx` (`'use client'`)

**Color pickers**: Native `<input type="color">` for `textColor` and
`backgroundColor`. No custom color picker library.

**Date pickers**: Existing `DatePicker` from `@/app/components/ui/datepicker`
for `displayFrom` and `displayUntil`. Props: `onSelect`, `fieldName`, `value`.

**Styling**: Tailwind v4 utility classes via `cn()`. No inline styles.

**Props**:

```typescript
interface BannerSlotCardProps {
  slot: BannerSlotFormData;
  onSave: (formData: FormData) => Promise<void>;
  onDelete: (slotNumber: number) => Promise<void>;
}

interface BannerSlotFormData {
  slotNumber: number;
  imageFilename: string;
  notification: {
    id: string;
    content: string | null;
    textColor: string | null;
    backgroundColor: string | null;
    displayFrom: string | null;
    displayUntil: string | null;
    repostedFromId: string | null;
  } | null;
}
```
