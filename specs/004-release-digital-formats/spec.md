# Feature Specification: Release Digital Formats Management

**Feature Branch**: `004-release-digital-formats`
**Created**: 2026-03-23
**Status**: Draft
**Input**: User description: "Add release digital formats management to the admin panel, allowing admins to upload and manage digital files (MP3, FLAC, etc.) associated with a release. Features include: uploading digital files, managing download URLs, setting suggested prices, unique download URLs for purchased releases, 5 free downloads per user before locking, accordion UI in admin panel showing format types with upload targets, secure URL generation, file validation, access control, logging and monitoring, scalability support, user support mechanism, accessibility standards, analytics and reporting."

## User Scenarios & Testing _(mandatory)_

### User Story 1 - Admin Uploads Digital Format for Release (Priority: P1)

An admin navigates to a release in the admin panel and wants to make digital files available for download. They see an accordion interface showing available digital formats (MP3, FLAC, WAV, AAC, etc.). For each format, they can upload a file which generates a unique, secure download URL automatically.

**Why this priority**: This is the core functionality that enables the entire feature. Without the ability to upload and manage digital formats, none of the other features (downloads, analytics, etc.) can function.

**Independent Test**: Can be fully tested by logging in as admin, navigating to a release, expanding a format accordion item, uploading a valid audio file, and verifying a download URL is generated with a visual confirmation (gray checkmark icon).

**Acceptance Scenarios**:

1. **Given** an admin is viewing a release in the admin panel, **When** they expand a format accordion item (e.g., "MP3 320kbps"), **Then** they see an upload target area
2. **Given** an upload target is visible, **When** the admin selects and uploads a valid audio file, **Then** a unique download URL is generated and a gray checkmark icon appears next to the format type
3. **Given** a format already has an uploaded file, **When** the admin views the accordion item, **Then** the checkmark icon is visible indicating the format is ready
4. **Given** an admin attempts to upload an invalid file type, **When** the upload is initiated, **Then** the system rejects the file with a clear error message

---

### User Story 2 - User Downloads Purchased Release (Priority: P2)

A user who has purchased a release can access unique download URLs for each available digital format. They click a download link and receive the file securely. The system tracks each download for analytics and access control.

**Why this priority**: This delivers direct value to paying customers and completes the purchase-to-delivery flow, making it essential for the business model.

**Independent Test**: Can be fully tested by creating a purchase record for a user and release, navigating to the release page as that user, clicking a download link, and verifying the file downloads successfully while being tracked.

**Acceptance Scenarios**:

1. **Given** a user has purchased a release, **When** they view the release page, **Then** they see download links for all available digital formats
2. **Given** a user clicks a download link, **When** the request is processed, **Then** the file downloads and the download event is logged
3. **Given** a user has not purchased a release, **When** they attempt to access a download URL directly, **Then** they are denied access with an appropriate message

---

### User Story 3 - Free Download Limit Enforcement (Priority: P2)

Users who have not purchased a release can access up to 5 free downloads across all releases. Once they reach this limit, the download buttons are locked and display a message to contact support or purchase the release.

**Why this priority**: This balances user acquisition (allowing trial downloads) with revenue protection, and is critical for the freemium model.

**Independent Test**: Can be fully tested by creating a new user account, downloading 5 different releases without purchasing, attempting a 6th download, and verifying the download is blocked with a contact support message.

**Acceptance Scenarios**:

1. **Given** a user has downloaded fewer than 5 free releases, **When** they click a download button, **Then** the download proceeds and their free download count increments
2. **Given** a user has reached 5 free downloads, **When** they view a release they haven't purchased, **Then** the download button is disabled with a message: "Free download limit reached. Please purchase or contact support."
3. **Given** a user has reached the free limit but purchases a release, **When** they view that release, **Then** the download button is enabled for that specific release

---

### User Story 4 - Admin Sets Suggested Price (Priority: P3)

An admin can set an optional suggested price for a release to guide users on Pay-What-You-Want purchases. This price appears as a recommendation during the checkout process.

**Why this priority**: While valuable for optimizing revenue, the PWYW purchase flow can function without a suggested price, making this a lower priority enhancement.

**Independent Test**: Can be fully tested by editing a release in the admin panel, entering a suggested price value, saving it, and verifying it appears in the purchase interface.

**Acceptance Scenarios**:

1. **Given** an admin is editing a release, **When** they enter a suggested price and save, **Then** the price is stored and associated with the release
2. **Given** a release has a suggested price, **When** a user initiates a PWYW purchase, **Then** the suggested price is displayed as a recommendation
3. **Given** a release has no suggested price, **When** a user initiates a PWYW purchase, **Then** the checkout proceeds without a price suggestion

---

### User Story 5 - Admin Views Download Analytics (Priority: P3)

Admins can view analytics showing download counts, user engagement, and popular formats for each release. This data helps inform business decisions about format priorities and release performance.

**Why this priority**: Analytics are valuable for business intelligence but not essential for core functionality. The system can operate without reporting features initially.

**Independent Test**: Can be fully tested by generating several download events for a release, navigating to the analytics view, and verifying accurate counts and format breakdowns are displayed.

**Acceptance Scenarios**:

1. **Given** a release has been downloaded multiple times, **When** an admin views the release analytics, **Then** they see total download counts per format
2. **Given** download events have been logged, **When** an admin filters by date range, **Then** the analytics update to show only downloads within that period
3. **Given** a release has no downloads, **When** an admin views analytics, **Then** they see zero counts with a message indicating no activity yet

---

## Clarifications

### Session 2026-03-23

- Q: How should repeated downloads of the same release be counted toward the 5 free download limit? → A: Only first download per release counts - user can download same release multiple times but only consumes 1 free download
- Q: When an admin replaces an existing digital format file, what happens to the download URL and old file? → A: Keep existing URL, replace file content atomically; old file archived for 30 days then deleted
- Q: When are signed download URLs generated - at upload time or on each download request? → A: Generate fresh signed URL on each download request (24-hour validity) after authorization check
- Q: What are the specific file size limits for each format type? → A: Format-specific limits - MP3/AAC: 100MB, FLAC: 250MB, WAV: 500MB
- Q: What happens when an admin deletes a digital format that users have already purchased? → A: Soft delete with 90-day grace period - existing purchasers retain access, new downloads blocked immediately, hard delete after grace period

### Edge Cases

- **Clarified**: When a user downloads the same release multiple times, only the first download counts toward the 5 free download limit. Subsequent downloads of the same release do not consume additional quota.
- How does the system handle upload failures mid-process? (File partially uploaded, network interruption)
- **Clarified**: When an admin replaces/updates a digital format file, the download URL remains unchanged (preserving user bookmarks and purchase records), the file content is replaced atomically, and the old file is archived for 30 days before deletion (allowing rollback if needed).
- **Clarified**: When an admin deletes a digital format, it is soft-deleted: existing purchasers retain access for 90 days (grace period), new downloads are blocked immediately, and the file is hard-deleted after the grace period expires. This protects customer value while allowing intentional content removal.
- **Clarified**: File size limits are format-specific to align with typical album-length content: MP3/AAC maximum 100MB, FLAC maximum 250MB, WAV maximum 500MB. These limits prevent abuse while accommodating legitimate use cases.
- **Clarified**: Signed download URLs are generated fresh on each download request (after authorization check) with 24-hour validity. The authorization endpoint checks purchase status or free download quota, then generates a time-limited signed URL to the S3 object. This balances security with unlimited access for purchased releases.
- How does the system handle concurrent uploads of different formats for the same release?

## Requirements _(mandatory)_

### Functional Requirements

- **FR-001**: System MUST provide an accordion UI in the admin panel displaying all available digital format types (MP3, FLAC, WAV, AAC, etc.)
- **FR-002**: System MUST allow admins to upload audio files for each digital format type with file validation for type and size
- **FR-003**: System MUST automatically generate a unique, secure, non-guessable download URL for each uploaded digital format
- **FR-004**: System MUST display a visual indicator (gray checkmark icon in a circle) when a format has a generated download URL
- **FR-005**: System MUST enforce a limit of 5 free unique release downloads per user before locking download access (repeated downloads of the same release count as one)
- **FR-006**: System MUST display download endpoints that verify authorization (purchase or free quota), then generate fresh time-limited signed URLs (24-hour validity) to access file
- **FR-007**: System MUST provide unique download URLs that are only accessible to users who have purchased the release or have free download access
- **FR-008**: System MUST track and log all file uploads and download events for security and analytics purposes
- **FR-009**: System MUST validate uploaded file types to ensure they match the selected format category
- **FR-010**: System MUST validate uploaded file sizes to prevent excessive storage consumption with format-specific limits (MP3/AAC: 100MB, FLAC: 250MB, WAV: 500MB)
- **FR-011**: System MUST allow admins to update or replace existing digital format files
- **FR-012**: System MUST allow admins to delete digital format files using soft-delete: existing purchasers retain access for 90 days, new downloads blocked immediately, hard delete after grace period
- **FR-013**: System MUST include proper authentication and authorization checks ensuring only authorized admins can manage digital formats
- **FR-014**: System MUST allow admins to set an optional suggested price for each release
- **FR-015**: System MUST securely store uploaded files with efficient retrieval mechanisms
- **FR-016**: System MUST handle expired or invalid download URLs gracefully with appropriate user messaging
- **FR-017**: System MUST provide admin interface feedback on successful uploads and clear error messages for failures
- **FR-018**: System MUST support user support requests related to download issues
- **FR-019**: System MUST meet accessibility standards (WCAG 2.1 AA) for both admin and user-facing interfaces
- **FR-020**: System MUST provide analytics showing download counts and format engagement per release

### Key Entities _(include if feature involves data)_

- **ReleaseDigitalFormat**: Represents a digital audio format associated with a release; includes format type (MP3, FLAC, WAV, AAC), S3 object key for file storage (download URLs generated on-demand via presigned URLs), upload timestamp, file size, checksum for integrity
- **DownloadEvent**: Represents a single download action; includes user reference, release reference, format type, download timestamp, IP address (for security), success/failure status
- **UserDownloadQuota**: Tracks free download usage per user; includes user reference, set of unique release IDs downloaded for free (max 5 unique releases), reset timestamp (if applicable), purchased release exceptions
- **Release**: Extended to include suggested price (optional Int in cents, e.g. 1599 = $15.99), collection of associated ReleaseDigitalFormat records, total download count

## Success Criteria _(mandatory)_

### Measurable Outcomes

- **SC-001**: Admins can upload a digital format file and see the checkmark indicator appear within 10 seconds of successful upload
- **SC-002**: Users can complete a download from click to file delivery in under 30 seconds for files up to 100MB
- **SC-003**: The system accurately enforces the 5 free download limit with zero false positives or bypasses
- **SC-004**: 95% of file uploads succeed on the first attempt without errors
- **SC-005**: All download URLs are unique and non-guessable (cryptographically secure, minimum 128-bit entropy)
- **SC-006**: The admin interface provides clear error messages for 100% of file upload failures
- **SC-007**: Download analytics display accurate counts within 1 minute of actual download events
- **SC-008**: The accordion UI is keyboard-navigable and screen-reader compatible, meeting WCAG 2.1 AA standards
- **SC-009**: The system supports concurrent management of digital formats across multiple releases without conflicts
- **SC-010**: Users can request support for download issues through a clear, accessible mechanism with response time expectation communicated

## Assumptions

- Audio file formats are limited to industry-standard types: MP3 (various bitrates), FLAC, WAV, AAC, with potential for future format additions
- File storage will use existing AWS S3 infrastructure consistent with current release image handling
- The current Stripe PWYW purchase implementation can be extended to include suggested pricing without major changes
- Admin users have already been authenticated via Auth.js before accessing the digital format management interface
- Download URLs will use signed URLs with 24-hour expiration generated fresh on each authorized download request (authorization check happens first, then URL is generated)
- The 5 free download limit applies to unique releases - users can download the same release multiple times without consuming additional free downloads
- Purchased releases grant unlimited downloads for the lifetime of the user account
- File replacement (updating an existing format) preserves the download URL, replaces content atomically, and archives the old file for 30 days before deletion
- Deleted formats use soft-delete with 90-day grace period for existing purchasers before hard deletion
- File size limits are format-specific: MP3/AAC 100MB, FLAC 250MB, WAV 500MB
