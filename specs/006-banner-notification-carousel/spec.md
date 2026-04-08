# Feature Specification: Banner & Notification Carousel

**Feature Branch**: `006-banner-notification-carousel`
**Created**: 2026-04-07
**Status**: Draft
**Input**: User description: "Build infinitely rotating banner carousel with paired notification strips, counter-slide animation, admin management with XSS-safe rich text, searchable notification repost, configurable rotation interval, and CDN-backed fixed banner images"

## User Scenarios & Testing _(mandatory)_

### User Story 1 - Visitor Views Rotating Banner Carousel (Priority: P1)

A visitor lands on the home page and sees a full-width banner image directly below
the site header. Above the banner, a notification strip displays styled text (if the
admin has configured one for the active date range). The banner and notification
rotate together on a timed interval. The banner slides left-to-right while the
notification strip simultaneously slides right-to-left, creating a mirrored
counter-slide effect. The carousel loops infinitely through all 5 banner slots.
Visitors can also swipe left/right on touch devices or use keyboard arrows to
manually navigate. If a notification contains a link, it is clickable.

**Why this priority**: The public-facing carousel is the core user experience and the
primary deliverable of this feature. Without it, nothing else matters.

**Independent Test**: Load the home page with at least 2 active banner/notification
pairs. Verify the carousel auto-rotates, supports swipe, and shows the counter-slide
animation.

**Acceptance Scenarios**:

1. **Given** 5 banner slots are configured with at least 3 having active
   notifications, **When** a visitor loads the home page, **Then** the first banner
   and its notification strip appear immediately below the header
2. **Given** the carousel is auto-rotating, **When** the interval elapses, **Then**
   the current banner slides out in one direction while the next notification slides
   in from the opposite direction, creating a mirrored counter-slide transition
3. **Given** a banner slot has no notification configured (or the notification is
   outside its date range), **When** that slot displays, **Then** only the banner
   image is shown with no notification strip above it
4. **Given** a visitor is on a touch device, **When** they swipe left or right on
   either the notification strip or the banner, **Then** both navigate together to
   the next/previous slide
5. **Given** the carousel reaches the last banner, **When** the interval elapses,
   **Then** it loops back to the first banner seamlessly (infinite loop)

---

### User Story 2 - Admin Manages Banner-Notification Pairs (Priority: P2)

An admin navigates to the notification banner management section in the admin panel.
They see a list of exactly 5 banner slots — one for each fixed CDN image. For each
slot, the admin can:

- Write notification text using limited HTML tags (`<strong>`, `<em>`, `<a>`) for
  safe rich text styling
- Set a text color (hex) to vary the notification appearance per-slide
- Set a start date and end date for the notification text (the banner image itself
  is always displayed)
- Search existing past notifications via a combobox and select one to repost/reuse
  with the current banner slot
- Configure the auto-rotation interval (in seconds) for the carousel

The admin form replaces the existing notification banner management section entirely.

**Why this priority**: Without admin tooling, the carousel can only show static
banners with no notification content. This story enables the full content management
workflow.

**Independent Test**: Log in as admin, navigate to the banner management section,
configure a notification for slot 1 with styled text, save, and verify it appears on
the home page.

**Acceptance Scenarios**:

1. **Given** an admin opens the banner management page, **When** the page loads,
   **Then** they see exactly 5 banner slots, each showing its fixed CDN image
   thumbnail
2. **Given** an admin is editing a banner slot, **When** they enter text containing
   `<strong>`, `<em>`, or `<a href="...">` tags, **Then** the system accepts and
   saves the content
3. **Given** an admin enters text containing `<script>`, `<img onerror>`, or any
   tag outside the allowed set, **When** they save, **Then** the system strips or
   rejects the disallowed tags and only preserves safe content
4. **Given** an admin clicks the "Repost notification" combobox, **When** they type
   a search term, **Then** the system shows matching past notifications filtered by
   the search query; selecting one populates the notification fields for the current
   slot
5. **Given** an admin sets a start date of April 10 and end date of April 20 for a
   notification, **When** a visitor loads the home page on April 15, **Then** the
   notification strip appears; on April 21, it does not
6. **Given** an admin sets the rotation interval to 8 seconds, **When** a visitor
   loads the home page, **Then** the carousel rotates every 8 seconds
7. **Given** a banner slot has no notification configured, **When** the admin views
   the slot, **Then** it shows only the CDN image preview with an option to add
   notification text

---

### User Story 3 - Conditional Notification Strip Display (Priority: P3)

The notification strip above the banner is conditionally rendered. If none of the
currently visible banner slots have an active notification (i.e., all notifications
are outside their date range or not configured), the notification strip area is
hidden entirely — visitors see only the banner images. When at least one banner has
an active notification, the strip appears for that specific slide and hides for
slides without one.

**Why this priority**: This is important UX polish that prevents showing empty
notification strips, but the feature works without it (just with an empty strip).

**Independent Test**: Configure 5 banners where 2 have notifications with future
dates. Load the home page and verify the notification strip only appears on slides
3-5 (the ones with current-date notifications) and is absent on slides 1-2.

**Acceptance Scenarios**:

1. **Given** no banner slot has an active notification for the current date, **When**
   a visitor loads the home page, **Then** no notification strip is rendered above
   the banners (banners display without the strip area)
2. **Given** banner slot 3 has an active notification but slots 1, 2, 4, 5 do not,
   **When** the carousel rotates to slot 3, **Then** the notification strip smoothly
   appears; when it rotates away from slot 3, **Then** the strip smoothly disappears
3. **Given** all 5 banner slots have active notifications, **When** the visitor
   navigates through all slides, **Then** the notification strip is always visible
   with content for each slide

---

### Edge Cases

- What happens when the notification text is very long? The system MUST truncate or
  wrap text to fit within the notification strip height (single line with ellipsis
  or max 2 lines).
- What happens when a notification's start date equals the end date? The notification
  is displayed for that entire calendar day (start of day to end of day).
- What happens when an admin deletes a notification that is currently live? The
  banner slot continues to display its image; the notification strip for that slot
  becomes empty on the next page load.
- What happens when `<a>` tags in the notification have `target` or `rel` attributes?
  The system MUST only allow `href` on `<a>` tags; all other attributes MUST be
  stripped. Links open in new tab by default (system adds `target="_blank"` and
  `rel="noopener noreferrer"` at render time).
- What happens when JavaScript is disabled? The first banner and notification MUST be
  visible as static content (no carousel rotation, but content is accessible).

## Requirements _(mandatory)_

### Functional Requirements

- **FR-001**: System MUST display exactly 5 banner slots on the home page, each
  backed by a fixed image from the CDN `/media/banners` directory
- **FR-002**: System MUST support an optional notification text paired with each
  banner slot, displayed as a strip directly below the site header and above the
  banner image
- **FR-003**: System MUST auto-rotate the carousel infinitely at an
  admin-configurable interval (default 6.5 seconds, configurable in whole seconds
  between 3 and 15)
- **FR-004**: Banner and notification MUST animate simultaneously using a
  counter-slide (mirror) transition: the banner slides in one direction while the
  notification slides in the opposite direction
- **FR-005**: Both the notification strip and the banner MUST be swipable on touch
  devices, navigating as a synchronized pair
- **FR-006**: System MUST support keyboard navigation (ArrowLeft/ArrowRight) for
  accessibility
- **FR-007**: Notification text MUST only allow `<strong>`, `<em>`, and `<a>` HTML
  tags; all other HTML MUST be stripped on save to prevent XSS
- **FR-008**: The `<a>` tag MUST only allow the `href` attribute; all other
  attributes (e.g., `onclick`, `onerror`) MUST be stripped
- **FR-009**: Admin MUST be able to set a hex color for the notification text per
  slot
- **FR-010**: Admin MUST be able to set a background color (hex) for the
  notification strip per slot; if no background color is set, the strip MUST
  render with a transparent background
- **FR-011**: The notification strip MUST have approximately 1px of white space
  (padding/margin) above and below it to visually separate it from the header
  and the banner image
- **FR-012**: When a visitor manually navigates (swipe or keyboard), the
  auto-rotation timer MUST reset to 0 and resume from the new slide position
- **FR-013**: When the browser tab is not visible, the notification strip
  animation MUST pause; banner image auto-rotation MUST continue regardless
  of tab visibility. When the tab becomes visible again, the notification
  strip MUST resume in sync with the current banner position
- **FR-014**: Admin MUST be able to set a start date and end date for each
  notification; notifications outside their date range MUST NOT be displayed to
  visitors
- **FR-015**: Each banner slot MUST be able to exist without an associated
  notification; the banner image displays regardless
- **FR-016**: When no notifications are active for the current date across any slot,
  the notification strip area MUST be completely hidden
- **FR-017**: Admin MUST be able to search past notifications via a searchable
  combobox and select one to repost/reuse with the current banner slot
- **FR-018**: The admin management section MUST replace the existing notification
  banner admin interface
- **FR-019**: The existing `Notification` data model MUST be adapted to support
  the banner-notification pairing (banner slot assignment, simplified text fields,
  text color, background color, date range scheduling)
- **FR-020**: Admin MUST be able to configure the carousel rotation interval from
  the admin interface, applied globally to all visitors

### Key Entities

- **BannerSlot**: Represents one of the 5 fixed banner positions. Attributes: slot
  number (1-5), CDN image filename, display order, associated notification
  (optional). The 5 CDN filenames are system constants — not admin-editable.
- **NotificationBanner** (adapted from existing `Notification`): The notification
  text content paired with a banner slot. Attributes: rich text content (HTML-safe
  subset), text color (hex), background color (hex), start date, end date, slot
  assignment, reposted-from reference (optional), admin author, timestamps.
- **CarouselConfig**: Global configuration for the carousel. Attributes: rotation
  interval (seconds). Could be a simple site-settings entry rather than a dedicated
  entity.

### Assumptions

- The 5 CDN banner images are already uploaded and available at known filenames in
  `/media/banners`. They are not managed through this feature.
- The existing `Notification` model (40+ fields for image processing, text overlay
  positioning, font sizing, shadows, rotation) is significantly more complex than
  needed for this feature. The model will be simplified or a new lightweight model
  will be used — the planning phase will determine the best approach.
- The notification strip is a single line of styled text (not an image-based overlay
  like the current system).
- The searchable combobox for reposting follows the existing `Popover + Command`
  pattern used by `ReleaseSelect` and `VenueSelect` in the admin.
- The "counter-slide" animation means: on forward navigation, the outgoing banner
  slides to the left while the outgoing notification slides to the right; incoming
  elements slide from the opposite edges.

## Clarifications

### Session 2026-04-07

- Q: Can the admin set a background color for the notification strip? → A: Yes, admin sets a hex background color per slot (FR-017)
- Q: What spacing should the notification strip have relative to the header and banner? → A: Approximately 1px of white space above and below the strip (FR-018)
- Q: When a visitor manually swipes or uses keyboard arrows, what happens to the auto-rotation timer? → A: Timer resets to 0 after manual navigation (FR-019)
- Q: Should the notification strip have a default background color when admin hasn't set one? → A: Transparent — no background unless explicitly set by admin
- Q: Should the carousel pause auto-rotation when the browser tab is hidden? → A: Only the notification strip pauses; banner images continue to auto-rotate regardless of tab visibility

## Success Criteria _(mandatory)_

### Measurable Outcomes

- **SC-001**: Visitors see the first banner and notification within 1 second of the
  home page becoming interactive
- **SC-002**: Admin can configure a notification for any banner slot and see it live
  on the home page within 30 seconds of saving
- **SC-003**: 100% of disallowed HTML tags and attributes are stripped from saved
  notification content (zero XSS vectors in stored data)
- **SC-004**: The carousel completes a full 5-slide rotation without visual glitches,
  stutters, or layout shifts, across mobile and desktop viewports
- **SC-005**: Touch swipe navigation responds within 100ms of gesture completion on
  mobile devices
- **SC-006**: Admin can search and select a past notification for repost in under 10
  seconds using the searchable combobox
- **SC-007**: Notifications outside their configured date range are never displayed
  to visitors (0% false-positive display rate)
