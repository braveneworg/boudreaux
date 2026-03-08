# Phase 0: Research & Technical Discovery

**Feature**: Tour Date Management System
**Date**: March 7, 2026
**Status**: ✅ Complete

## Research Objectives

Resolve technical unknowns and establish implementation patterns for tour management feature following existing project conventions.

## Technology Stack Analysis

### Framework & Language

**Decision**: TypeScript 5.x + Next.js 16.1.6+ with App Router
**Rationale**: Matches existing project stack. Strict TypeScript mode enforced in tsconfig.json.
**Evidence**: Verified in package.json, tsconfig.json

### Data Layer

**Decision**: Prisma 6.x with MongoDB
**Rationale**: Project already uses Prisma as ORM with MongoDB datasource. Artist and Group models already exist.
**Evidence**: Examined prisma/schema.prisma - found existing Artist and Group models
**Action Required**: Add Tour, Venue, and TourImage models to schema

### Authentication & Authorization

**Decision**: Auth.js (NextAuth) with existing patterns
**Rationale**: Project uses Auth.js with User model including role field. Admin routes already protected.
**Evidence**: Found auth.ts config, examined existing admin routes
**Pattern**: Apply same auth checks used in admin/releases, admin/artists

### File Storage

**Decision**: AWS S3 via AWS SDK
**Rationale**: Project already configured with @aws-sdk/client-ses, package.json shows AWS integration
**Evidence**: AWS SDK dependency present, scripts/s3-backup.ts demonstrates S3 usage patterns
**Pattern**: Follow image upload patterns similar to existing media handling

### UI Components & Styling

**Decision**: shadcn/ui + Tailwind CSS v4
**Rationale**: Project uses shadcn/ui components throughout, Tailwind v4 configured
**Evidence**: components.json present, postcss.config.mjs with Tailwind v4
**Alternatives Considered**: None - must maintain UI consistency

### Form Handling

**Decision**: React Hook Form + Zod validation
**Rationale**: Constitutional requirement, existing patterns in src/app/components/forms/fields/
**Evidence**: Multiple form components use React Hook Form with Zod schemas
**Pattern**: Follow existing form field patterns (artist-multi-select, etc.)

### Data Fetching & Caching

**Decision**: Tanstack Query for client-side, Server Components for SSR
**Rationale**: Project uses Tanstack Query, Server Components are default per constitution
**Evidence**: Dependencies in package.json
**Pattern**: Server Components for tour display, Tanstack Query for search/filtering

## Existing Patterns Analysis

### Admin Section Structure

**Pattern Discovered**: Consistent structure across admin entities

```
admin/[entity]/
├── page.tsx              # List/dashboard
├── new/page.tsx          # Create form
└── [entityId]/page.tsx   # Edit form
```

**Applied To**: Will create admin/tours/ following this pattern
**Evidence**: Examined admin/releases/, admin/artists/, admin/groups/

### Server Actions Pattern

**Pattern Discovered**: Mutations via Server Actions in app/actions/
**Evidence**: While actions directory exists, Server Actions likely colocated with routes
**Decision**: Create app/actions/tours.ts for tour CRUD operations
**Validation**: All actions use Zod schemas, return type-safe results

### Repository Pattern

**Pattern Discovered**: Prisma queries abstracted in lib/prisma/
**Evidence**: Found lib/ directory structure
**Decision**: Create lib/prisma/tours.ts for database operations
**Benefit**: Separation of concerns, testability

### Business Logic Layer

**Pattern Discovered**: Complex logic in lib/services/
**Decision**: Create tour-service.ts for business logic like artist name fallback
**Rationale**: Keep components focused on presentation

## Artist Display Name Logic

### Requirement

Display artist names with fallback: display name → group display name → firstName + lastName

### Research

- Artist model has: displayName, firstName, lastName
- Group model has: displayName
- ArtistGroup junction table connects artists to groups
- Need to query relationships to implement fallback

### Implementation Approach

**Decision**: Create utility function in lib/utils/artist-display-name.ts
**Algorithm**:

1. Check artist.displayName - if present, use it
2. If not, fetch related groups via ArtistGroup
3. If group exists, use group.displayName
4. If neither, construct from artist.firstName + " " + artist.lastName
5. Handle null/undefined gracefully with fallback to "Unknown Artist"

**Testing**: Unit tests for all fallback scenarios

## Image Upload Strategy

### Requirements

- Multiple images per tour (max 10)
- File type validation (JPEG, PNG, GIF, WebP)
- File size limit (10MB)
- Secure upload to S3
- Cleanup on tour deletion

### Research

**S3 Pattern**: Project has s3-backup.ts demonstrating AWS SDK usage
**Decision**: Create lib/services/image-service.ts for S3 operations
**Flow**:

1. Client-side: File selection and validation
2. Generate presigned S3 URL via Server Action
3. Direct upload to S3 from client
4. Store S3 URL/key in TourImage model
5. On deletion: Remove from DB and S3

**Security**: Presigned URLs with expiration, file type validation server-side

## Venue Management

### Requirement

Venue model doesn't exist but is needed for tours

### Research

**Decision**: Create Venue model in Prisma schema
**Fields**:

- id: String (MongoDB ObjectId)
- name: String
- address: String (optional)
- city: String (optional)
- state: String (optional)
- country: String (optional)
- createdAt: DateTime
- updatedAt: DateTime

**UI Pattern**: Inline venue creation during tour creation (select existing or create new)
**Reference**: Similar to how artists might be associated with releases

## Search Implementation

### Requirement

Search tours by artist/headliner name

### Research

**Options Considered**:

1. Client-side filtering - Simple but limited for large datasets
2. Database query with text search - More scalable
3. Dedicated search service - Overkill for initial version

**Decision**: Client-side filtering with Tanstack Query caching
**Rationale**:Size the user's convenience - maximum 200 tours per requirements
**Implementation**: Filter tour list by checking if any headliner name matches search term
**Future**: Can upgrade to server-side search if dataset grows

## Date Sorting & Display

### Requirement

Display tours "most recent first" - chronological order

### Research

**Clarification**: "Most recent" means mostrecent START date
**Sorting**: Sort by tour.startDate DESC in database query
**Index**: Add index on startDate for query performance

### Date Handling

**Decision**: Store dates as DateTime in MongoDB
**Display**: Format with date-fns or Intl.DateTimeFormat
**Timezone**: Store in UTC, display in user's or venue's timezone

## Testing Strategy

### Unit Tests

- Services: tour-service.ts, image-service.ts, venue-service.ts
- Utils: artist-display-name.ts, date-utils.ts
- Validation: Zod schemas

### Component Tests

- Forms: tour-form, venue-selector, image-upload
- Display: tour-card, tour-list, tour-search
- Coverage target: 90-95%+

### E2E Tests (Playwright)

1. Admin creates tour with all fields
2. Admin uploads multiple images
3. Admin edits existing tour
4. Admin deletes tour (verify cleanup)
5. Public user views tours page
6. Public user searches for artist
7. Public user views individual tour

## Performance Considerations

### Database Queries

- Index on Tour.startDate for sorting
- Include artist/group relations in queries to avoid N+1
- Pagination if tour count exceeds 200

### Image Optimization

- Use Next.js `<Image>` component
- Responsive images with srcset
- Lazy loading below fold

### Caching

- Server Components cache tour data
- Tanstack Query caches search results
- Revalidate on tour updates

## Security Measures

### Authentication

- All admin routes require authentication
- Check user.role === 'admin' or similar

### Input Validation

- Zod schemas for all tour data
- File type and size validation
- URL sanitization for ticketsUrl

### File Upload Security

- Presigned S3 URLs with short expiration
- Server-side file type validation
- Prevent directory traversal in filenames

## Accessibility Requirements

### Forms

- All inputs have associated labels
- Error messages announced to screen readers
- Keyboard navigation throughout

### Tour Display

- Semantic HTML (article, time, address elements)
- Alt text for all tour images
- ARIA labels for interactive elements

### Search

- Label for search input
- Live region for search results count
- Keyboard accessible

## Open Questions & Decisions

### ✅ Resolved

1. ~~How to handle venue creation?~~ → Inline during tour creation
2. ~~Store images where?~~ → AWS S3 via SDK
3. ~~Search implementation?~~ → Client-side filtering initially
4. ~~Artist name fallback logic?~~ → Utility function with documented algorithm
5. ~~Existing models availability?~~ → Artist and Group exist, create Tour and Venue

### No Outstanding Questions

All technical decisions made and documented above.

## Best Practices Applied

### From Existing Project

1. **TypeScript strict mode** - Matches tsconfig.json
2. **Server Components default** - Per Next.js App Router pattern
3. **Server Actions for mutations** - Constitutional requirement
4. **Prisma repositories** - Separation of concerns
5. **shadcn/ui components** - UI consistency
6. **React Hook Form + Zod** - Form handling standard
7. **Vitest + Playwright** - Testing framework
8. **MPL 2.0 headers** - License compliance

### Constitutional Alignment

- ✅ TypeScript-first with strict mode
- ✅ Next.js App Router architecture
- ✅ TDD with 90-95%+ coverage
- ✅ Security (auth, validation, sanitization)
- ✅ Performance (memoization, lazy loading, caching)
- ✅ Code quality (separation of concerns, DRY, docs)
- ✅ Accessibility (semantic HTML, ARIA, keyboard nav)

## Implementation Readiness

**Status**: ✅ Ready for Phase 1 (Design & Contracts)

All technical unknowns resolved. Clear implementation path established following existing project patterns and constitutional principles. No blockers identified.

## References

- [Feature Specification](./spec.md)
- [Implementation Plan](./plan.md)
- [Project Constitution](../../.specify/memory/constitution.md)
- Existing patterns: src/app/admin/releases/, src/app/admin/artists/
- AWS SDK usage: scripts/s3-backup.ts
- Prisma schema: prisma/schema.prisma
