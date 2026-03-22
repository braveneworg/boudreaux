# Tour Management - Developer Quickstart Guide

## Overview

This guide helps developers set up, run, and test the tour management feature in their local development environment.

## Prerequisites

- Node.js 18+ and npm
- Docker and Docker Compose
- AWS CLI configured (for S3 operations)
- MongoDB (via Docker or local installation)
- Git

## Initial Setup

### 1. Clone and Install Dependencies

```bash
# Navigate to project root
cd /path/to/boudreaux

# Install dependencies
pnpm install
```

### 2. Environment Configuration

Create or update `.env.local` with required environment variables:

```env
# Database
DATABASE_URL="mongodb://localhost:27017/boudreaux"

# Authentication
NEXTAUTH_URL="http://localhost:3000"
NEXTAUTH_SECRET="your-secret-key-here"

# AWS S3 (for tour images)
AWS_REGION="us-east-1"
AWS_ACCESS_KEY_ID="your-access-key"
AWS_SECRET_ACCESS_KEY="your-secret-key"
S3_BUCKET_NAME="boudreaux-tour-images"

# Admin email (for testing)
ADMIN_EMAIL="admin@example.com"
```

### 3. Start Database

Using Docker Compose:

```bash
# Start MongoDB container
docker-compose up -d mongo

# Verify MongoDB is running
docker-compose ps
```

Or using local MongoDB:

```bash
# Start MongoDB service
brew services start mongodb-community  # macOS
sudo systemctl start mongod            # Linux
```

### 4. Database Migration

Run Prisma migrations to create the tour management schema:

```bash
# Generate Prisma client
pnpm exec prisma generate

# Push schema to database (development)
pnpm exec prisma db push

# Or run migrations (production-like)
pnpm exec prisma migrate dev --name add-tour-management
```

### 5. Seed Database (Optional)

Seed the database with sample data:

```bash
pnpm exec prisma db seed
```

This will create:

- Sample artists
- Sample groups
- Sample venues
- Sample tours with relationships

## Running Locally

### Development Server

```bash
# Start Next.js development server
pnpm run dev
```

The application will be available at `http://localhost:3000`

### Key URLs

- **Public tours page**: `http://localhost:3000/tours`
- **Admin tours management**: `http://localhost:3000/admin/tours`
- **Create new tour**: `http://localhost:3000/admin/tours/new`
- **Edit tour**: `http://localhost:3000/admin/tours/[id]/edit`

## Testing

### Unit Tests

Run all unit tests:

```bash
# Run tests in watch mode
pnpm run test

# Run tests once
pnpm run test:run

# Run with coverage
pnpm run test:coverage
```

Run specific test suites:

```bash
# Test tour repository
pnpm run test -- tour-repository

# Test tour service
pnpm run test -- tour-service

# Test tour form validation
pnpm run test -- tour-validation
```

### E2E Tests

Run end-to-end tests with Playwright:

```bash
# Run all E2E tests
pnpm run test:e2e

# Run in UI mode for debugging
pnpm run test:e2e:ui

# Run specific test
pnpm run test:e2e -- tours
```

### Test Coverage Goals

- Aim for 90-95% coverage on all new code
- Required coverage for:
  - Repository layer: 95%+
  - Service layer: 90%+
  - Validation schemas: 100%
  - Utility functions: 95%+

## Common Development Tasks

### Adding a New Field to Tour

1. **Update Prisma schema** (`prisma/schema.prisma`):

```prisma
model Tour {
  // ... existing fields
  newField String?
}
```

2. **Run migration**:

```bash
pnpm exec prisma migrate dev --name add-tour-new-field
```

3. **Update Zod schema** (`lib/validations/tour.ts`):

```typescript
export const tourSchema = z.object({
  // ... existing fields
  newField: z.string().optional(),
});
```

4. **Update TypeScript types** (`specs/002-tour-management/contracts/tour-types.ts`)

5. **Update form component** (`app/admin/tours/components/tour-form.tsx`)

6. **Write tests** for the new field

### Creating a New Tour (Manual Testing)

1. Navigate to `http://localhost:3000/admin/tours/new`
2. Fill in required fields:
   - Title
   - Start date
   - Show start time
   - Venue (create new or select existing)
   - At least one headliner artist
3. Optional fields:
   - Subtitle, subtitle2
   - Description, notes
   - End date, show end time
   - Ticket URL and price
4. Upload images (up to 10)
5. Submit form

### Debugging Image Upload

If image uploads fail:

1. **Check S3 bucket configuration**:

```bash
aws s3 ls s3://boudreaux-tour-images
```

2. **Verify IAM permissions** for S3 access

3. **Check browser console** for presigned URL generation errors

4. **Test presigned URL generation**:

```bash
# In browser console or API client
POST /api/tours/[tourId]/images/upload
{
  "fileName": "test.jpg",
  "fileSize": 123456,
  "mimeType": "image/jpeg"
}
```

### Resetting Test Database

```bash
# Drop and recreate database
pnpm exec prisma migrate reset

# Reseed with sample data
pnpm exec prisma db seed
```

## Project Structure

```
specs/002-tour-management/
├── spec.md                    # Feature specification
├── plan.md                    # Implementation plan
├── research.md                # Technical research
├── data-model.md              # Database design
├── quickstart.md              # This file
└── contracts/
    ├── tour-api.openapi.yaml  # API specification
    └── tour-types.ts          # TypeScript types

src/app/
├── tours/                     # Public tours page
│   ├── page.tsx
│   └── components/
│       ├── tour-list.tsx
│       ├── tour-card.tsx
│       └── tour-search.tsx
└── admin/
    └── tours/                 # Admin management
        ├── page.tsx
        ├── new/
        │   └── page.tsx
        └── [id]/
            └── edit/
                └── page.tsx

src/lib/
├── repositories/
│   ├── tour-repository.ts     # Data access layer
│   └── venue-repository.ts
├── services/
│   ├── tour-service.ts        # Business logic
│   └── image-upload-service.ts
├── validations/
│   ├── tour.ts                # Zod schemas
│   └── venue.ts
└── utils/
    └── artist-display-name.ts # Display name fallback logic

prisma/
└── schema.prisma              # Database schema with Tour models
```

## API Testing

### Using curl

**List all tours:**

```bash
curl http://localhost:3000/api/tours
```

**Get tour by ID:**

```bash
curl http://localhost:3000/api/tours/[tourId]
```

**Create tour (authenticated):**

```bash
curl -X POST http://localhost:3000/api/tours \
  -H "Content-Type: application/json" \
  -H "Cookie: next-auth.session-token=YOUR_SESSION_TOKEN" \
  -d '{
    "title": "Summer Tour 2024",
    "startDate": "2024-07-01T20:00:00Z",
    "showStartTime": "2024-07-01T20:00:00Z",
    "venueId": "venue-id-here",
    "headlinerIds": ["artist-id-1", "artist-id-2"]
  }'
```

### Using Postman/Insomnia

Import the OpenAPI specification from:
`specs/002-tour-management/contracts/tour-api.openapi.yaml`

## Troubleshooting

### Database Connection Issues

**Error**: `Can't reach database server`

**Solution**:

```bash
# Check MongoDB is running
docker-compose ps

# Restart MongoDB
docker-compose restart mongo

# Check DATABASE_URL in .env.local
```

### Prisma Client Errors

**Error**: `Prisma Client not generated`

**Solution**:

```bash
pnpm exec prisma generate
```

### Authentication Issues

**Error**: `Unauthorized` when accessing admin routes

**Solution**:

1. Sign in at `http://localhost:3000/auth/signin`
2. Ensure your user has admin role in database
3. Check `NEXTAUTH_SECRET` is set in `.env.local`

### Test Failures

**Error**: Tests fail due to missing dependencies

**Solution**:

```bash
# Clear node_modules and reinstall
rm -rf node_modules package-lock.json
pnpm install

# Clear Vitest cache
pnpm exec vitest --clear-cache
```

## Code Quality Checks

Before committing code:

```bash
# Run linter
pnpm run lint

# Fix linting issues
pnpm run lint:fix

# Format code
pnpm run format

# Run all tests
pnpm run test:run

# Check test coverage
pnpm run test:coverage
```

## Performance Monitoring

### Query Performance

Monitor slow database queries:

```bash
# Enable Prisma query logging
DEBUG="prisma:query" pnpm run dev
```

### Image Upload Performance

- Presigned URLs expire after 15 minutes
- Max upload size: 10MB per image
- Supported formats: JPEG, PNG, GIF, WebP
- Max 10 images per tour

## Next Steps

After setting up:

1. **Review the feature specification**: `specs/002-tour-management/spec.md`
2. **Study the data model**: `specs/002-tour-management/data-model.md`
3. **Read API contracts**: `specs/002-tour-management/contracts/`
4. **Start implementing**: Follow the tasks in `tasks.md` (when available)
5. **Write tests first**: Follow TDD approach per constitution

## Support

For questions or issues:

- Review existing code patterns in `src/app/admin/releases/`
- Consult `.github/copilot-instructions.md` for project conventions
- Check `.specify/memory/constitution.md` for architectural principles
