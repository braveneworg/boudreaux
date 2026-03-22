# Phase 1: Data Model Design

**Feature**: Tour Date Management System
**Date**: March 7, 2026
**Status**: ✅ Complete

## Entity Relationship Overview

```text
┌─────────────┐       ┌──────────────┐       ┌─────────────┐
│   Artist    │──────▶│ TourHeadliner│◀──────│    Tour     │
└─────────────┘       └──────────────┘       └─────────────┘
      │                                             │
      │                                             │
      │               ┌──────────────┐             │
      └──────────────▶│ ArtistGroup  │             │
                      └──────────────┘             │
                            │                      │
                            ▼                      ▼
                      ┌─────────────┐       ┌─────────────┐
                      │    Group    │       │   Venue     │
                      └─────────────┘       └─────────────┘
                                                  │
                                                  ▼
                                            ┌─────────────┐
                                            │  TourImage  │
                                            └─────────────┘
```

## Core Entities

### Tour

Primary entity representing a tour event with all associated information.

**Prisma Model**:

```prisma
model Tour {
  id          String   @id @default(auto()) @map("_id") @db.ObjectId

  // Basic Information
  title       String
  subtitle    String?
  subtitle2   String?
  description String?
  notes       String?

  // Ticket Information
  ticketsUrl  String?
  ticketPrice String?  // Flexible text: "$25", "$20-$50", "Free", etc.

  // Date & Time
  startDate   DateTime
  endDate     DateTime?
  showStartTime DateTime
  showEndTime   DateTime?

  // Relationships
  venueId     String   @db.ObjectId
  venue       Venue    @relation(fields: [venueId], references: [id], onDelete: Cascade)

  headliners  TourHeadliner[]  // Many-to-many with Artist
  images      TourImage[]       // One-to-many

  // Metadata
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
  createdBy   String?  @db.ObjectId

  // Indexes for performance
  @@index([startDate(sort: Desc)])
  @@index([venueId])
  @@index([createdAt])
}
```

**Field Specifications**:

| Field         | Type         | Required | Constraints           | Description                     |
| ------------- | ------------ | -------- | --------------------- | ------------------------------- |
| id            | ObjectId     | Yes      | Auto-generated        | Unique identifier               |
| title         | String       | Yes      | Max 200 chars         | Main tour name                  |
| subtitle      | String       | No       | Max 150 chars         | Secondary title                 |
| subtitle2     | String       | No       | Max 150 chars         | Tertiary title                  |
| description   | String       | No       | Max 5000 chars        | Detailed tour information       |
| notes         | String       | No       | Max 2000 chars        | Additional info/disclaimers     |
| ticketsUrl    | String (URL) | No       | Valid URL format      | External ticket purchase link   |
| ticketPrices  | String       | No       | Max 100 chars         | Pricing info (flexible format)  |
| startDate     | DateTime     | Yes      | Not in far future     | Tour/show start date            |
| endDate       | DateTime     | No       | After startDate       | Optional end date for multi-day |
| showStartTime | DateTime     | Yes      | Valid time            | When show begins                |
| showEndTime   | DateTime     | No       | After showStartTime   | When show ends                  |
| venueId       | ObjectId     | Yes      | Valid Venue reference | Associated venue                |
| createdAt     | DateTime     | Yes      | Auto-set              | Record creation timestamp       |
| updatedAt     | DateTime     | Yes      | Auto-update           | Last modification timestamp     |
| createdBy     | ObjectId     | No       | Valid User reference  | Admin who created (audit)       |

**Validation Rules** (Zod Schema):

```typescript
const TourSchema = z
  .object({
    title: z.string({ message: 'Title is required' }).min(1, 'Title is required').max(200),
    subtitle: z.string().max(150).optional().nullable(),
    subtitle2: z.string().max(150).optional().nullable(),
    description: z.string().max(5000).optional().nullable(),
    notes: z.string().max(2000).optional().nullable(),
    ticketsUrl: z.string().url().or(z.literal('')).optional().nullable(),
    ticketPrices: z.string().max(100).optional().nullable(),
    startDate: z.coerce.date({ message: 'Start date is required' }),
    endDate: z.coerce.date().optional().nullable(),
    showStartTime: z.coerce.date({ message: 'Show start time is required' }),
    showEndTime: z.coerce.date().optional().nullable(),
    venueId: z.string({ message: 'Venue is required' }),
    headlinerIds: z.array(z.string()).min(1, 'At least one headliner is required'),
  })
  .refine(
    (data) => {
      // If both dates present, endDate must be after startDate
      if (data.endDate && data.startDate) {
        return data.endDate >= data.startDate;
      }
      return true;
    },
    {
      message: 'End date must be after start date',
      path: ['endDate'],
    }
  )
  .refine(
    (data) => {
      // If both times present, endTime must be after startTime
      if (data.showEndTime && data.showStartTime) {
        return data.showEndTime > data.showStartTime;
      }
      return true;
    },
    {
      message: 'Show end time must be after start time',
      path: ['showEndTime'],
    }
  );
```

---

### Venue

Represents a physical location where tours/shows take place.

**Prisma Model**:

```prisma
model Venue {
  id          String   @id @default(auto()) @map("_id") @db.ObjectId

  // Basic Information
  name        String

  // Location Details
  address     String?
  city        String
  state       String?
  zipCode     String?
  country     String?

  // Metadata
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  // Relationships
  tours       Tour[]

  // Indexes
  @@index([name])
  @@index([city, state])
}
```

**Field Specifications**:

| Field     | Type     | Required | Constraints    | Description           |
| --------- | -------- | -------- | -------------- | --------------------- |
| id        | ObjectId | Yes      | Auto-generated | Unique identifier     |
| name      | String   | Yes      | Max 200 chars  | Venue name            |
| address   | String   | No       | Max 500 chars  | Street address        |
| city      | String   | Yes      | Max 100 chars  | City                  |
| state     | String   | No       | Max 100 chars  | State/province/region |
| zipCode   | String   | No       | Max 20 chars   | Postal code           |
| country   | String   | No       | Max 100 chars  | Country               |
| creatdAt  | DateTime | Yes      | Auto-set       | Record creation       |
| updatedAt | DateTime | Yes      | Auto-update    | Last modification     |

**Validation Rules** (Zod Schema):

```typescript
const VenueSchema = z.object({
  name: z.string({ message: 'Name is required' }).min(1, 'Name is required').max(200),
  address: z.string().max(500).optional().nullable(),
  city: z.string({ message: 'City is required' }).min(1, 'City is required').max(100),
  state: z.string().max(100).optional().nullable(),
  zipCode: z.string().max(20).optional().nullable(),
  country: z.string().max(100).optional().nullable(),
});
```

---

### TourHeadliner

Junction table connecting Tours to Artists (many-to-many relationship for headliners).

**Prisma Model**:

```prisma
model TourHeadliner {
  id        String   @id @default(auto()) @map("_id") @db.ObjectId

  tourId    String   @db.ObjectId
  tour      Tour     @relation(fields: [tourId], references: [id], onDelete: Cascade)

  // Headliner can be either an Artist OR a Group (mutually exclusive)
  artistId  String?  @db.ObjectId
  artist    Artist?  @relation(fields: [artistId], references: [id], onDelete: Cascade)

  groupId   String?  @db.ObjectId
  group     Group?   @relation(fields: [groupId], references: [id], onDelete: Cascade)

  // Display order if multiple headliners
  sortOrder Int      @default(0)

  createdAt DateTime @default(now())

  // Note: Either artistId OR groupId must be set (validated at application level)
  @@index([tourId])
  @@index([artistId])
  @@index([groupId])
}
```

**Purpose**: Allows multiple artists OR groups to headline a single tour while maintaining ordered lists.

**Field Specifications**:

| Field     | Type     | Required | Constraints                               | Description                 |
| --------- | -------- | -------- | ----------------------------------------- | --------------------------- |
| id        | ObjectId | Yes      | Auto-generated                            | Unique identifier           |
| tourId    | ObjectId | Yes      | Valid Tour reference                      | Associated tour             |
| artistId  | ObjectId | No       | Valid Artist reference (XOR with groupId) | Associated artist           |
| groupId   | ObjectId | No       | Valid Group reference (XOR with artistId) | Associated group            |
| sortOrder | Int      | Yes      | >= 0                                      | Display order (0 = primary) |
| createdAt | DateTime | Yes      | Auto-set                                  | When association created    |

**Business Rules**:

- Exactly one of `artistId` OR `groupId` must be set (mutually exclusive)
- Cannot have both artistId and groupId on the same TourHeadliner record
- Application layer MUST validate this constraint before database insert
- `sortOrder` determines display order of headliners (ascending)

---

### TourImage

Stores promotional images and artwork for tours.

**Prisma Model**:

```prisma
model TourImage {
  id          String   @id @default(auto()) @map("_id") @db.ObjectId

  tourId      String   @db.ObjectId
  tour        Tour     @relation(fields: [tourId], references: [id], onDelete: Cascade)

  // S3 Storage
  s3Key       String   // S3 object key
  s3Url       String   // Full S3 URL for display
  s3Bucket    String   // Bucket name for management

  // File Information
  fileName    String   // Original filename
  fileSize    Int      // Size in bytes
  mimeType    String   // e.g., "image/jpeg"

  // Display
  displayOrder Int     @default(0)
  altText     String?  // Accessibility

  // Metadata
  createdAt   DateTime @default(now())
  uploadedBy  String?  @db.ObjectId

  @@index([tourId])
  @@index([displayOrder])
}
```

**Field Specifications**:

| Field        | Type     | Required | Constraints          | Description                                  |
| ------------ | -------- | -------- | -------------------- | -------------------------------------------- |
| id           | ObjectId | Yes      | Auto-generated       | Unique identifier                            |
| tourId       | ObjectId | Yes      | Valid Tour reference | Parent tour                                  |
| s3Key        | String   | Yes      | Max 500 chars        | S3 object key/path                           |
| s3Url        | String   | Yes      | Max 1000 chars       | Full URL for access                          |
| s3Bucket     | String   | Yes      | Max 200 chars        | Bucket name                                  |
| fileName     | String   | Yes      | Max 255 chars        | Original filename                            |
| fileSize     | Int      | Yes      | 1-10485760 (10MB)    | File size in bytes                           |
| mimeType     | String   | Yes      | Enum                 | image/jpeg, image/png, image/gif, image/webp |
| displayOrder | Int      | Yes      | >= 0                 | Sort order for multiple images               |
| altText      | String   | No       | Max 500 chars        | Alt text for accessibility                   |
| createdAt    | DateTime | Yes      | Auto-set             | Upload timestamp                             |
| uploadedBy   | ObjectId | No       | Valid User reference | User who uploaded                            |

**Validation Rules** (Zod Schema):

```typescript
const TourImageSchema = z.object({
  tourId: z.string(),
  fileName: z.string().min(1).max(255),
  fileSize: z.number().min(1).max(10485760), // 10MB max
  mimeType: z.enum(['image/jpeg', 'image/png', 'image/gif', 'image/webp']),
  displayOrder: z.number().min(0).default(0),
  altText: z.string().max(500).optional().nullable(),
});
```

---

## Existing Entity Usage

### Artist (Already Exists)

Used for tour headliners. The project already has a robust Artist model.

**Relevant Fields** (from existing schema):

```prisma
model Artist {
  id             String   @id @default(auto()) @map("_id") @db.ObjectId
  displayName    String?
  firstName      String?
  lastName       String?
  // ... other fields
  groups         ArtistGroup[]  // Relationship to Group
  tourHeadliners TourHeadliner[]  // NEW: Add this
}
```

**Changes Required**: Add `tourHeadliners TourHeadliner[]` relationship

---

### Group (Already Exists)

Used for artist group association in name fallback logic.

**Relevant Fields** (from existing schema):

```prisma
model Group {
  id          String   @id @default(auto()) @map("_id") @db.ObjectId
  displayName String
  // ... other fields
  artists     ArtistGroup[]  // Existing relationship
}
```

**Changes Required**: None (accessed via Artist relationship)

---

### ArtistGroup (Already Exists)

Junction table connecting Artists to Groups.

**No changes required** - used as-is for artist name fallback logic.

---

## Data Access Patterns

### Query Patterns

#### 1. Get All Tours (Sorted, with Relations)

```typescript
// lib/prisma/tours.ts
export async function getAllTours() {
  return prisma.tour.findMany({
    include: {
      venue: true,
      headliners: {
        include: {
          artist: {
            include: {
              groups: {
                include: {
                  group: true,
                },
              },
            },
          },
        },
        orderBy: { order: 'asc' },
      },
      images: {
        orderBy: { displayOrder: 'asc' },
      },
    },
    orderBy: { startDate: 'desc' },
  });
}
```

#### 2. Get Single Tour

```typescript
export async function getTourById(id: string) {
  return prisma.tour.findUnique({
    where: { id },
    include: {
      venue: true,
      headliners: {
        include: {
          artist: {
            include: {
              groups: {
                include: {
                  group: true,
                },
              },
            },
          },
        },
        orderBy: { order: 'asc' },
      },
      images: {
        orderBy: { displayOrder: 'asc' },
      },
    },
  });
}
```

#### 3. Create Tour

```typescript
export async function createTour(data: TourCreateInput) {
  return prisma.tour.create({
    data: {
      ...data,
      venue: {
        connect: { id: data.venueId },
      },
      headliners: {
        create: data.headlinerIds.map((artistId, index) => ({
          artistId,
          order: index,
        })),
      },
    },
    include: getAllToursInclude,
  });
}
```

#### 4. Update Tour

```typescript
export async function updateTour(id: string, data: TourUpdateInput) {
  // Handle headliner updates separately due to junction table
  const { headlinerIds, ...tourData } = data;

  return prisma.$transaction(async (tx) => {
    // Update tour basic data
    const tour = await tx.tour.update({
      where: { id },
      data: tourData,
    });

    // Update headliners if provided
    if (headlinerIds) {
      await tx.tourHeadliner.deleteMany({ where: { tourId: id } });
      await tx.tourHeadliner.createMany({
        data: headlinerIds.map((artistId, index) => ({
          tourId: id,
          artistId,
          order: index,
        })),
      });
    }

    return getTourById(id);
  });
}
```

#### 5. Delete Tour

```typescript
export async function deleteTour(id: string) {
  // Cascade delete will remove TourHeadliner and TourImage records
  // But we need to clean up S3 files first
  const tour = await getTourById(id);

  // Delete S3 images
  for (const image of tour.images) {
    await deleteFromS3(image.s3Bucket, image.s3Key);
  }

  // Delete tour (cascade handles relations)
  return prisma.tour.delete({
    where: { id },
  });
}
```

### Search Pattern

```typescript
// Client-side filtering for initial version
export function filterToursByArtist(tours: Tour[], searchTerm: string) {
  if (!searchTerm.trim()) return tours;

  const normalizedSearch = searchTerm.toLowerCase();

  return tours.filter((tour) =>
    tour.headliners.some((headliner) => {
      const artistName = getArtistDisplayName(headliner.artist);
      return artistName.toLowerCase().includes(normalizedSearch);
    })
  );
}
```

---

## Artist Display Name Logic

### Algorithm

```typescript
// lib/utils/artist-display-name.ts
export function getArtistDisplayName(artist: ArtistWithGroups): string {
  // 1. Check artist displayName
  if (artist.displayName?.trim()) {
    return artist.displayName;
  }

  // 2. Check for group displayName (if artist has groups)
  if (artist.groups && artist.groups.length > 0) {
    const firstGroup = artist.groups[0].group;
    if (firstGroup.displayName?.trim()) {
      return firstGroup.displayName;
    }
  }

  // 3. Construct from firstName + lastName
  const firstName = artist.firstName?.trim() || '';
  const lastName = artist.lastName?.trim() || '';

  if (firstName && lastName) {
    return `${firstName} ${lastName}`;
  } else if (firstName) {
    return firstName;
  } else if (lastName) {
    return lastName;
  }

  // 4. Final fallback
  return 'Unknown Artist';
}

// TypeScript types
interface ArtistWithGroups {
  displayName?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  groups?: {
    group: {
      displayName: string;
    };
  }[];
}
```

---

## Indexing Strategy

### Performance Indexes

```prisma
// Tour indexes
@@index([startDate(sort: Desc)])  // Primary sort
@@index([venueId])                 // Venue lookups
@@index([createdAt])               // Admin views

// Venue indexes
@@index([name])                    // Name searches
@@index([city, state])             // Location queries

// TourHeadliner indexes
@@unique([tourId, artistId])       // Prevent duplicates
@@index([tourId])                  // Tour headliner lookups
@@index([artistId])                // Artist tour lookups

// TourImage indexes
@@index([tourId])                  // Tour image lookups
@@index([displayOrder])            // Sorting
```

### Query Performance

- **Tour list query**: Indexed on `startDate DESC` - O(log n) + O(k) for k results
- **Artist search**: Client-side filtering on loaded data - O(n\*m) where n=tours, m=avg headliners
- **Venue lookup**: Indexed on `venueId` - O(log n)
- **Image retrieval**: Indexed on `tourId` and `displayOrder` - O(log n) + O(k)

---

## Migration Strategy

### Schema Changes Required

```prisma
// Add to existing schema.prisma

// 1. New Venue model
model Venue {
  // ... as defined above
}

// 2. New Tour model
model Tour {
  // ... as defined above
}

// 3. New TourHeadliner junction
model TourHeadliner {
  // ... as defined above
}

// 4. New TourImage model
model TourImage {
  // ... as defined above
}

// 5. Update Artist model
model Artist {
  // ... existing fields
  tourHeadliners TourHeadliner[]  // ADD THIS LINE
}

// No changes needed to Group or ArtistGroup
```

### Migration Steps

1. **Create migration**: `pnpm exec prisma migrate dev --name add-tour-management`
2. **Apply to database**: Migration runs automatically in dev
3. **Generate Prisma client**: `pnpm exec prisma generate`
4. **Seed test data** (optional): Create sample tours in seed.ts
5. **Verify indexes**: Check MongoDB indexes were created

---

## Type Safety

### Generated Prisma Types

```typescript
// Automatically generated by Prisma
import type { Tour, Venue, TourImage, TourHeadliner, Artist, Group } from '@prisma/client';

// Composite types for queries with relations
export type TourWithRelations = Tour & {
  venue: Venue;
  headliners: (TourHeadliner & {
    artist: Artist & {
      groups: (ArtistGroup & {
        group: Group;
      })[];
    };
  })[];
  images: TourImage[];
};
```

### Custom Types

```typescript
// lib/types/tour.ts
export interface TourFormData {
  title: string;
  subtitle?: string | null;
  subtitle2?: string | null;
  description?: string | null;
  notes?: string | null;
  ticketsUrl?: string | null;
  ticketPrice?: string | null;
  startDate: Date;
  endDate?: Date | null;
  showStartTime: Date;
  showEndTime?: Date | null;
  venueId: string;
  headlinerIds: string[];
}

export interface TourListItem {
  id: string;
  title: string;
  subtitle?: string | null;
  startDate: Date;
  venue: {
    name: string;
    city?: string | null;
    state?: string | null;
  };
  headlinerNames: string[]; // Computed with displayName logic
  primaryImage?: {
    s3Url: string;
    altText?: string | null;
  };
}
```

---

## Data Integrity Rules

### Referential Integrity

- **Tour → Venue**: `onDelete: Cascade` - Deleting tour removes venue reference but not venue itself
- **Tour → TourHeadliner**: `onDelete: Cascade` - Deleting tour removes all headliner associations
- **Tour → TourImage**: `onDelete: Cascade` - Deleting tour removes all image records (trigger S3 cleanup)
- **TourHeadliner → Artist**: `onDelete: Cascade` - Deleting artist removes headliner associations
- **TourHeadliner → Tour**: `onDelete: Cascade` - Already covered above

### Business Rules

1. **Tour must have at least one headliner** - Enforced in form validation and Server Actions
2. **Show end time must be after start time** - Zod schema validation
3. **End date must be >= start date** - Zod schema validation
4. **Max 10 images per tour** - Enforced in UI and Server Actions
5. **Image file size <= 10MB** - Enforced in upload validation
6. **Valid image MIME types only** - Enforced in upload validation and Zod schema
7. **Venue must exist before tour creation** - Foreign key constraint + validation
8. **Unique tour-artist pairs in headliners** - Database unique constraint on [tourId, artistId]

---

## Audit & Metadata

### Tracking Fields

- createdAt: Automatic timestamp on creation
- updatedAt: Automatic timestamp on every update
- createdBy: Optional User ID for audit trail
- uploadedBy: Track who uploaded images

### Soft Delete Consideration

**Decision**: NOT implementing soft delete initially
**Rationale**: Tours are historical records; genuine deletes are rare
**Future**: Can add `deletedAt?: DateTime?` and `isDeleted: Boolean` if needed

---

## Data Model Summary

**New Models**: 4 (Tour, Venue, TourHeadliner, TourImage)
**Modified Models**: 1 (Artist - add relationship)
**No Changes**: 2 (Group, ArtistGroup)
**Total Fields**: 45+ across all tour-related entities
**Relationships**: 6 (tour-venue, tour-headliners, tour-images, headliner-artist, artist-groups, group-artists)
**Indexes**: 10+ for query optimization
**Validation Schemas**: 3 (Tour, Venue, TourImage)
**Type Safety**: Full Prisma-generated types + custom DTOs

**Status**: ✅ Data model complete and ready for implementation
