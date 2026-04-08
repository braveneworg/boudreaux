# Data Model: Banner & Notification Carousel

**Branch**: `006-banner-notification-carousel` | **Date**: 2026-04-07

## New Model: BannerNotification

Replaces the existing 42-field `Notification` model with a focused 13-field
model for banner-notification pairs.

### Prisma Schema

```prisma
model BannerNotification {
  id              String    @id @default(auto()) @map("_id") @db.ObjectId
  slotNumber      Int       // 1-5, maps to fixed CDN banner image
  content         String?   // HTML-safe rich text (strong, em, a tags only)
  textColor       String?   // Hex color for notification text (e.g., "#ffffff")
  backgroundColor String?   // Hex color for notification strip background; null = transparent
  displayFrom     DateTime? // Notification visible from this date (inclusive)
  displayUntil    DateTime? // Notification visible until this date (inclusive)
  repostedFromId  String?   @db.ObjectId // Reference to original notification (for reposts)
  addedBy         User      @relation("bannerNotifications", fields: [addedById], references: [id], onDelete: Cascade)
  addedById       String    @db.ObjectId
  createdAt       DateTime  @default(now())
  updatedAt       DateTime  @updatedAt

  @@unique([slotNumber]) // One notification per slot at a time
  @@index([addedById])
  @@index([displayFrom])
  @@index([displayUntil])
}
```

### Fields

| Field             | Type     | Required | Default        | Description                                        |
| ----------------- | -------- | -------- | -------------- | -------------------------------------------------- |
| `id`              | ObjectId | auto     | auto-generated | Primary key                                        |
| `slotNumber`      | Int      | yes      | —              | Banner position (1-5), unique constraint           |
| `content`         | String   | no       | null           | Sanitized HTML (strong, em, a tags only)           |
| `textColor`       | String   | no       | null           | Hex color for text display                         |
| `backgroundColor` | String   | no       | null           | Hex color for strip background; null = transparent |
| `displayFrom`     | DateTime | no       | null           | Start of notification visibility window            |
| `displayUntil`    | DateTime | no       | null           | End of notification visibility window              |
| `repostedFromId`  | ObjectId | no       | null           | Self-reference for repost tracking                 |
| `addedById`       | ObjectId | yes      | —              | Admin user who created/edited                      |
| `createdAt`       | DateTime | auto     | now()          | Creation timestamp                                 |
| `updatedAt`       | DateTime | auto     | @updatedAt     | Last modification timestamp                        |

### Relationships

- `addedBy -> User` (many-to-one): Each notification is created by an admin user.
  Uses a named relation `"bannerNotifications"` to avoid conflict with the
  existing `Notification.addedBy` relation.
- `repostedFromId`: Soft reference (not a Prisma relation) to allow referencing
  archived notifications without foreign key constraints.

### Validation Rules

- `slotNumber`: Integer, 1-5, validated via Zod `z.coerce.number().int().min(1).max(5)`
- `content`: String, max 500 chars after sanitization. Only `<strong>`, `<em>`,
  `<a>` tags allowed. `<a>` allows only `href` attribute.
- `textColor`: Optional hex color, regex `^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$`
- `backgroundColor`: Same hex validation as textColor; null means transparent
- `displayFrom`/`displayUntil`: ISO 8601 datetime; `displayUntil >= displayFrom`
  when both are set
- `repostedFromId`: Valid ObjectId format if provided

### State Transitions

Notifications have a simple lifecycle:

1. **Empty slot** → No `BannerNotification` record exists for that slotNumber
   (or record exists with null content)
2. **Active** → Record has content + current date is within displayFrom/displayUntil
3. **Scheduled** → Record has content + displayFrom is in the future
4. **Expired** → Record has content + displayUntil is in the past
5. **No dates** → Record has content + no displayFrom/displayUntil = always active

---

## System Constants: Banner Slots

The 5 banner images are fixed CDN assets, not database-managed.

```typescript
export const BANNER_SLOTS = [
  { slotNumber: 1, filename: 'FFINC Banner 1_5_1920.webp' },
  { slotNumber: 2, filename: 'FFINC Banner 2_5_1920.webp' },
  { slotNumber: 3, filename: 'FFINC Banner 3_5_1920.webp' },
  { slotNumber: 4, filename: 'FFINC Banner 4_5_1920.webp' },
  { slotNumber: 5, filename: 'FFINC Banner 5_5_1920.webp' },
] as const;

export const BANNER_CDN_PATH = 'media/banners';
```

---

## Global Configuration: Rotation Interval

Stored as a simple key-value rather than a dedicated model.

**Option A (recommended)**: Add a `rotationInterval` field to the API response
that returns banner data. Store it as a separate `SiteConfig` document or
inline with the first banner slot query.

**Option B**: Create a minimal `SiteSettings` model:

```prisma
model SiteSettings {
  id                String @id @default(auto()) @map("_id") @db.ObjectId
  key               String @unique
  value             String
  updatedAt         DateTime @updatedAt
}
```

For MVP, a simple env var fallback with a database override is sufficient.
The service checks DB first, falls back to `NEXT_PUBLIC_BANNER_INTERVAL` or
default 6.5s.

---

## Existing Model: Notification (Preserved)

The existing `Notification` model (42 fields) is **not modified or deleted**.
It remains in the schema for data preservation. The `User` model keeps its
existing `notifications Notification[]` relation.

The new `BannerNotification` model uses a separate named relation
(`bannerNotifications`) on the `User` model:

```prisma
// Addition to User model
bannerNotifications BannerNotification[] @relation("bannerNotifications")
```

---

## Archived Notifications (for Repost Search)

Past notifications for the repost combobox are queried from the
`BannerNotification` collection itself — any record where:

- `content` is not null
- Optionally filtered by search text matching `content`

This keeps the repost feature self-contained within the new model. If legacy
`Notification` records should also be searchable for repost, a union query
across both collections can be added later.
