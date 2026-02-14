# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.5.1] - 2026-02-14

### Security

- Sanitize raw error messages in all server actions to prevent internal details from leaking to clients
- Add ObjectId format validation for `notificationId` in notification banner actions
- Extract shared `OBJECT_ID_REGEX` and `isValidObjectId` utility to `src/lib/utils/validation/object-id.ts`
- Replace `console.error` with structured logger across all action files
- Refactor authentication handling to use `requireRole` for consistent session validation

### Changed

- Convert `getActionState` from default export to named export for consistency with project conventions
- Standardize all import paths to use absolute `@/lib/...` imports instead of relative paths
- Fix slug generation loop off-by-one in `find-or-create-artist-action` and `find-or-create-group-action`
- Remove unnecessary `processedPayload` shallow copy in `notification-banner-action`

### Fixed

- Fix `setUnknownError` mock in tests to match actual default message
- Replace invalid ObjectId test fixtures (`notification-123`, `non-existent`) with valid 24-character hex strings
- Update all test error expectations to match sanitized error messages
- Fix TypeScript type errors in test files where `requireRole` mock used `undefined` instead of a `Session` value
- Fix 61 ESLint import ordering issues across modified files

### Tests

- Add tests for invalid ObjectId format validation (update, delete, publish, unpublish)
- Add slug generation loop cap edge case test
- Update vi.mock paths to match absolute import paths

## [0.5.0] - 2026-02-14

### Added

- Bulk track upload with duplicate detection via audio file hash
- CoverArtField component for cover art uploads in forms
- Notification banner image processing action
- Presigned S3 upload actions for audio and images
- Test coverage for low-coverage files and recent changes
- MongoDB backup and restore scripts
- S3 backup, restore, and upload scripts
- Image upload script with CloudFront cache invalidation

### Changed

- Style navigation menu and close on auth link click
- Add spacing around notification banner
- Refactor duplicate track filtering to ensure `audioFileHash` is defined

### Fixed

- Fix CDN integration with Next.js
- Fix certificate/CDN issues
- Fix `.next` directory build issues
