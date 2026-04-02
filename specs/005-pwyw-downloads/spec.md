# Feature Specification: PWYW Downloads

**Feature Branch**: `005-pwyw-downloads`
**Created**: 2026-04-01
**Status**: Draft
**Input**: User description: "After a pay what you want purchase, replace the dialog content with a multi-select format picker, allowing the user to select each file format they want to download, and then on the server-side zipping up all selected file formats, each format in its own directory in the zip file that is downloaded to the user"

## User Scenarios & Testing _(mandatory)_

### User Story 1 - Post-Purchase Format Selection (Priority: P1)

After completing a PWYW purchase, the user sees a multi-select format
picker (using ToggleGroup) instead of a generic download link. They
select the formats they want (e.g., FLAC, MP3_V0, WAV) and click
"Download". The server bundles those formats into a ZIP file — each
format in its own named directory — and streams it to the browser.

**Why this priority**: This is the core feature — connecting the purchase
confirmation step to the format-specific S3 bundle download system.
Without this, purchasers are sent to the legacy download route that
doesn't serve format-specific S3 files.

**Independent Test**: Complete a PWYW purchase in the download dialog,
verify the format picker appears, select formats, click download, and
confirm the ZIP contains the correct directory structure.

**Acceptance Scenarios**:

1. **Given** a user completes a PWYW purchase, **When** the purchase is
   confirmed via webhook, **Then** the dialog transitions to a format
   selection step showing all available digital formats for the release.
2. **Given** the format selection step is displayed, **When** the user
   selects 2 formats and clicks "Download", **Then** a ZIP file is
   streamed containing 2 directories (one per format) with the correct
   audio files inside each.
3. **Given** the format selection step is displayed, **When** no formats
   are available for the release, **Then** a fallback message is shown
   indicating no digital formats are available.

---

### User Story 2 - Returning Purchaser Format Selection (Priority: P2)

When a user who has already purchased a release opens the download
dialog, they go directly to the format selection step (existing
`format-select` step). This already works via `FormatBundleDownload`.
This story verifies the existing behavior is preserved and that the
download count tracking remains accurate when using the bundle route.

**Why this priority**: Ensures the existing returning-purchaser path
continues working correctly after the new post-purchase flow is added.

**Independent Test**: Open the download dialog as a user who previously
purchased the release. Confirm you see the format picker with accurate
download count. Download and verify count increments by 1 (not N).

**Acceptance Scenarios**:

1. **Given** a returning authenticated purchaser opens the dialog,
   **When** downloadCount < 5, **Then** they see the format selection
   step with the correct download count displayed.
2. **Given** a returning guest purchaser provides their email, **When**
   they have a purchase but are not at the download cap, **Then** they
   see the format selection step instead of the legacy download link.

---

### User Story 3 - Legacy Download Route Deprecation (Priority: P3)

Replace all references to the legacy `/api/releases/[id]/download` route
(which uses static `downloadUrls[]`) with the format-specific S3 bundle
system. Update the purchase confirmation email download link. Deprecate
the legacy route.

**Why this priority**: Cleanup task that ensures consistency but doesn't
block core functionality.

**Independent Test**: Search codebase for references to the legacy
download route. Verify all paths now use the format selection → bundle
download flow.

**Acceptance Scenarios**:

1. **Given** the purchase confirmation email is sent, **When** the user
   clicks the download link, **Then** they are directed to the release
   page where they can access the format picker (not the legacy route).
2. **Given** the legacy `/api/releases/[id]/download` route exists,
   **When** it is accessed, **Then** it redirects to the release page
   or returns a deprecation notice.

---

### Edge Cases

- What happens when a release has no digital formats uploaded? Show a
  clear message: "No digital formats available for download."
- What happens when a user's download count is at the 5-download cap?
  Show "Download limit reached" with support contact.
- What happens if the ZIP streaming fails mid-download? The bundle route
  already handles errors; the client sees a failed download.
- What happens if the Stripe webhook hasn't confirmed the purchase yet
  but the client transitions? The existing polling mechanism in
  `PurchaseCheckoutStep` already waits for webhook confirmation before
  calling `onConfirmed`.

## Requirements _(mandatory)_

### Functional Requirements

- **FR-001**: After PWYW purchase confirmation, the dialog MUST display a
  format selection step with all available digital formats for the release.
- **FR-002**: The format selection MUST use a multi-select ToggleGroup
  component (all formats selected by default).
- **FR-003**: Clicking "Download" MUST trigger the existing bundle API
  route (`/api/releases/[id]/download/bundle?formats=...`) to stream a
  ZIP file.
- **FR-004**: Each format in the ZIP MUST be in its own named directory
  (using `FORMAT_LABELS` for directory names).
- **FR-005**: The bundle download MUST count as 1 download toward the
  per-release 5-download cap.
- **FR-006**: Guest returning purchasers who are not at the download cap
  MUST see the format selection step instead of the legacy download link.
- **FR-007**: Free downloads require authentication (no guest free path).
- **FR-008**: The purchase confirmation email download link MUST be
  updated to point to the release page instead of the legacy route.

### Key Entities _(existing — no new models needed)_

- **ReleaseDigitalFormat**: Stores format metadata per release (S3 keys,
  file sizes, format type). Already exists from 004.
- **ReleasePurchase**: Records confirmed PWYW purchases. Already exists
  from 003.
- **ReleaseDownload**: Tracks per-user, per-release download count (cap
  of 5). Already exists from 003.

## Success Criteria _(mandatory)_

### Measurable Outcomes

- **SC-001**: Users who complete a PWYW purchase see the format picker
  100% of the time (no more legacy download link after purchase).
- **SC-002**: ZIP downloads contain the correct directory structure with
  format-labeled folders.
- **SC-003**: Download count increments by exactly 1 per bundle download
  regardless of how many formats are selected.
- **SC-004**: All references to the legacy `/api/releases/[id]/download`
  route are removed or redirected.
- **SC-005**: 90-95%+ test coverage on modified files.
