# Feature Specification: Release Search & Media Player

**Feature Branch**: `001-release-search-player`
**Created**: 2026-02-21
**Status**: Draft
**Input**: User description: "Update the releases page. Add a search combobox to search releases by artist firstName, lastName, displayName, releaseDisplayName, release title, and group displayName. The results should display the cover art with the artist name and release title beneath the cover art, linking to the release bandcamp url. Add a listen link button below with a leading music notes icon and the label 'Play ${release.title}'. When it's clicked go to the release media player page that needs to be created. The release media player page should be able to use an instance of the media player component already created in the project with same formatting as the landing page's media player, including a carousel of other releases by the same artist above the cover art on the release media player page. The entire feature should be mobile-first. Add a section below the release media player with a blurb about the release from the Release data. Add a breadcrumb nav already implemented in the components at the top of any page created."

## Clarifications

### Session 2026-02-21

- Q: What is the search UX pattern — combobox dropdown, inline grid filter, or hybrid? → A: Combobox dropdown — typing shows a floating results list; selecting an item navigates to the release or its player page.
- Q: When a release has multiple artists, which artist's releases appear in the "other releases" carousel? → A: Primary artist only — the carousel shows releases by the first/primary artist based on the ArtistRelease join order.
- Q: Should the "Play" button be hidden on listing cards for releases with no playable tracks? → A: No — always show the Play button. The media player page handles the empty state with a "no tracks available" message.
- Q: How should cover art images on the listing page be loaded (eager, lazy with skeletons, or progressive)? → A: Lazy loading with skeleton placeholders — images below the fold use lazy loading with skeleton placeholders; above-the-fold images load eagerly.
- Q: Should the release description render as plain text or support Markdown? → A: Plain text only — the schema says "plain text for now"; Markdown support deferred to a future enhancement.

## User Scenarios & Testing _(mandatory)_

### User Story 1 — Browse & Search Releases (Priority: P1)

As a fan visiting the releases page, I want to see all published releases displayed as a visual grid of cover art cards so I can browse the label's catalog. I also want to search for specific releases by typing an artist's name, a release title, or a group name into a combobox dropdown, so I can quickly find music I'm looking for. The combobox displays matching results in a floating dropdown list as I type; selecting a result navigates me directly to that release's media player page or Bandcamp URL. The card grid below the combobox displays all published releases by default. Each result card should show the cover art image with the artist name and release title beneath it. Each card links to the release's Bandcamp URL so I can purchase or stream directly. Below the card, a "Play {release title}" button with a music notes icon navigates me to in-app listening.

**Why this priority**: This is the core discovery mechanism for the entire feature. Without a browsable and searchable releases page, fans cannot find music. The releases page is the entry point for all subsequent user journeys (listening, purchasing). It delivers standalone value even without the media player page.

**Independent Test**: Can be fully tested by navigating to `/releases`, verifying the grid of release cards renders, typing a search query, and confirming filtered results appear with correct cover art, artist names, release titles, Bandcamp links, and "Play" buttons.

**Acceptance Scenarios**:

1. **Given** published releases exist in the system, **When** a fan navigates to the releases page, **Then** all published releases are displayed as a grid of cards, each showing cover art, artist name, and release title, ordered by release date (newest first).
2. **Given** the releases page is loaded, **When** a fan types "Monk" into the search combobox, **Then** a floating dropdown list appears showing releases matching an artist's first name, last name, display name, the release's display name, the release title, or a group's display name containing "Monk". Each dropdown item displays the release cover art thumbnail, artist name, and release title.
3. **Given** a release card is displayed, **When** the fan clicks the cover art or the release title, **Then** they are navigated to the release's Bandcamp URL in a new tab.
4. **Given** a release card is displayed, **When** the fan clicks the "Play {release title}" button, **Then** they are navigated to the release media player page at `/releases/{releaseId}`.
5. **Given** the fan is on a mobile device (viewport < 640px), **When** the releases page loads, **Then** the grid displays one card per row, cards are full-width, and the search combobox is prominent and easy to use.
6. **Given** a dropdown result is shown, **When** the fan selects a result from the dropdown, **Then** they are navigated to that release's media player page at `/releases/{releaseId}`.
7. **Given** the releases page is loaded, **When** a fan types a query that matches no releases, **Then** the dropdown displays a "No releases found" empty state message.
8. **Given** the releases page is loaded, **When** the fan clears the search input or closes the dropdown, **Then** the full card grid remains visible in the default order.

---

### User Story 2 — Listen to a Release (Priority: P2)

As a fan who found a release they want to hear, I want to navigate to a dedicated release media player page where I can listen to the release's tracks using an in-app audio player. The player should match the look and feel of the landing page's featured artists player, including interactive cover art, audio playback controls, a track list drawer, and a scrolling info ticker. Above the cover art, I want to see a carousel of other releases by the primary artist (the first artist associated with the release) so I can discover more of their music.

**Why this priority**: Listening is the second most important action a fan takes after discovery. This story depends on the releases page existing (P1) for navigation, but it can also be accessed directly via URL. It delivers the core listening experience and drives deeper fan engagement.

**Independent Test**: Can be fully tested by navigating directly to `/releases/{releaseId}`, verifying the media player renders with the correct release's cover art, tracks play through the audio controls, the track list drawer shows all tracks, and the artist carousel displays other releases by the same artist.

**Acceptance Scenarios**:

1. **Given** a valid release exists with tracks and audio URLs, **When** the fan navigates to `/releases/{releaseId}`, **Then** the media player page loads showing the release's cover art, the audio player controls, and a track list drawer with all tracks in the correct order.
2. **Given** the release media player page is loaded, **When** the fan clicks the interactive cover art or presses the play button, **Then** the first track begins playing and the player controls reflect the playing state.
3. **Given** a track is playing, **When** the track ends, **Then** the next track in the release automatically begins playing.
4. **Given** the release has associated artists, **When** the page loads, **Then** a carousel above the cover art displays other published releases by the primary artist (first artist in the ArtistRelease join), each with cover art, and clicking one navigates to that release's media player page.
5. **Given** the primary artist has only the current release, **When** the page loads, **Then** the "other releases" carousel section is hidden rather than showing an empty carousel.
6. **Given** the fan is on a mobile device, **When** the release media player page loads, **Then** the layout adapts gracefully: the carousel items are smaller, the cover art fills the screen width, and controls are touch-friendly.

---

### User Story 3 — Read About a Release (Priority: P3)

As a fan listening to a release, I want to read a description or blurb about the release below the media player, so I can learn about the music, the story behind it, or production credits.

**Why this priority**: The release description enriches the listening experience and adds context that can deepen fan engagement. It depends on the media player page (P2) existing and enhances an already functional page. It's a relatively contained addition.

**Independent Test**: Can be fully tested by navigating to a release page that has a description, verifying the blurb renders below the media player. For releases without a description, verify the section is hidden gracefully.

**Acceptance Scenarios**:

1. **Given** a release has a `description` field populated, **When** the fan scrolls below the media player on the release page, **Then** a section displays the release description/blurb as plain text with readable typography and proper line breaks (newlines rendered as line breaks).
2. **Given** a release has no `description` (null or empty), **When** the fan views the release page, **Then** the description section is not rendered and no empty whitespace appears.
3. **Given** the description is long (500+ characters), **When** the fan views the release page on mobile, **Then** the full text is displayed with proper line breaks and readable typography, without horizontal overflow.

---

### User Story 4 — Navigate with Breadcrumbs (Priority: P4)

As a fan browsing the site, I want a breadcrumb navigation at the top of the releases page and the release media player page so I can understand my location in the site hierarchy and navigate back easily.

**Why this priority**: Breadcrumbs improve navigation and user orientation. This is a lower-priority UX enhancement that applies to both new pages. The breadcrumb component already exists and this story adds minimal scope.

**Independent Test**: Can be fully tested by navigating to `/releases` and verifying the breadcrumb shows "Home > Releases". Then navigating to `/releases/{releaseId}` and verifying it shows "Home > Releases > {Release Title}". Clicking breadcrumb links navigates correctly.

**Acceptance Scenarios**:

1. **Given** the fan is on the releases page, **When** the page loads, **Then** a breadcrumb navigation displays "Home > Releases" at the top of the page, with "Home" linking to `/` and "Releases" shown as the active page.
2. **Given** the fan is on a release media player page, **When** the page loads, **Then** the breadcrumb displays "Home > Releases > {Release Title}", with "Home" linking to `/`, "Releases" linking to `/releases`, and the release title shown as the active page.
3. **Given** the fan clicks "Releases" in the breadcrumb on the release media player page, **When** the navigation occurs, **Then** they are taken back to the releases listing page.
4. **Given** the fan is on a mobile device, **When** the breadcrumb renders, **Then** long release titles are truncated with an ellipsis to prevent layout overflow.

---

### Edge Cases

- What happens when a release has no cover art URL? → Display a styled placeholder card with the release title and artist name in text.
- What happens when a release has no Bandcamp URL? → The card should still display, but the title/cover art should not be wrapped in a link. The "Play" button remains functional to navigate to the in-app media player.
- What happens when a release has no tracks or all tracks lack audio URLs? → The media player page should display the cover art and description but show a message indicating no playable tracks are available. Audio controls should not render.
- What happens when the search query contains special characters? → The search should safely handle all input; special characters should be escaped or ignored as needed without errors.
- What happens when the releases page loads but the data fetch fails? → An error state should display with a user-friendly message and a retry option.
- What happens when the release referenced by the URL does not exist (404)? → Display a "Release not found" message with a link back to the releases page.
- What happens when the artist carousel on the media player page has many releases (20+)? → The carousel should handle large datasets gracefully, rendering only visible items and supporting navigation arrows and swipe gestures.
- What happens when the release description contains very long unbroken strings (e.g., URLs)? → Text should wrap or overflow gracefully without breaking the layout.

## Requirements _(mandatory)_

### Functional Requirements

- **FR-001**: System MUST provide a public releases page accessible at `/releases` that displays all published releases (where `publishedAt` is set and `deletedOn` is null) as a responsive grid of cover art cards.
- **FR-002**: Each release card MUST display: the release cover art image, the artist name (using the display name fallback chain: artist displayName → firstName + surname → group displayName), and the release title beneath the cover art.
- **FR-003**: Each release card's cover art and title MUST link to the release's Bandcamp URL (opening in a new tab). If no Bandcamp URL exists, the cover art and title should be unlinked.
- **FR-004**: Each release card MUST include a "Play {release title}" button with a leading music notes icon that navigates the user to the release media player page at `/releases/{releaseId}`. The Play button MUST always be displayed regardless of whether the release has playable tracks; the media player page is responsible for handling the no-tracks state.
- **FR-005**: System MUST provide a combobox dropdown at the top of the releases page that searches releases by: artist first name, artist surname, artist display name, release display name, release title, and group display name. Matching results appear in a floating dropdown list as the user types. Each dropdown item displays a cover art thumbnail, artist name, and release title. Selecting a dropdown item navigates the user to that release's media player page. The card grid below the combobox always displays the full catalog regardless of the search query.
- **FR-006**: Search MUST be case-insensitive and return results in the dropdown as the user types (with appropriate debouncing to avoid excessive requests).
- **FR-007**: When no search results match, the dropdown MUST display a "No releases found" empty state message.
- **FR-008**: System MUST provide a release media player page accessible at `/releases/{releaseId}` that renders the existing media player component with the same visual formatting as the landing page's featured artists player.
- **FR-009**: The release media player page MUST include: interactive cover art (click to play/pause), audio playback controls (play, pause, seek, skip forward/back, previous/next track, volume), a track list drawer showing all tracks in order, and an info ticker displaying the current track and artist information.
- **FR-010**: The release media player page MUST display a carousel of other published releases by the primary artist (the first artist in the ArtistRelease join order) above the cover art. Each carousel item shows cover art and links to that release's media player page. The carousel MUST be hidden if the primary artist has no other releases.
- **FR-011**: The release media player page MUST display a description/blurb section below the media player, populated from the release's `description` field rendered as plain text (no Markdown parsing). The section MUST be hidden when no description exists.
- **FR-012**: Both the releases page and the release media player page MUST include breadcrumb navigation at the top, using the existing BreadcrumbMenu component: "Home > Releases" on the listing page and "Home > Releases > {Release Title}" on the media player page.
- **FR-013**: Both pages MUST be mobile-first responsive: the grid should collapse to a single-column layout on small screens, touch targets must be appropriately sized, and all interactive elements must be accessible on mobile devices.
- **FR-014**: When a release has no cover art, the system MUST display a styled placeholder (e.g., a card with the release title and artist name in text form).
- **FR-015**: When a release has no playable tracks (no tracks or no audio URLs), the media player page MUST display cover art and description but show a message indicating no tracks are available, and audio controls should not render.
- **FR-016**: The release media player page MUST return a 404-style "Release not found" message with a navigation link back to `/releases` when an invalid or non-existent release ID is provided.
- **FR-017**: Release cards on the listing page MUST be ordered by release date, newest first.
- **FR-018**: The releases page MUST follow the existing layout pattern: PageContainer > ContentContainer > BreadcrumbMenu > content.
- **FR-019**: Cover art images on the releases listing page MUST use lazy loading with skeleton placeholders for images below the fold, and eager loading for above-the-fold images, to optimize initial page load performance on mobile devices.

### Key Entities

- **Release**: A published musical release with a title, cover art image URL, description/blurb, release date, and associated tracks. Linked to one or more artists, optionally a group, and may have external URLs (e.g., Bandcamp). Serves as the central entity for both the listing cards and the media player page.
- **Artist**: A musician associated with one or more releases. Has first name, surname, display name, and images. Used for search filtering, display name rendering on cards, and determining "other releases by this artist" for the carousel.
- **Group**: A musical group or band with a display name. Associated with artists and releases. Used as a search filter dimension and a fallback for artist display name.
- **Track**: An individual song belonging to a release. Has a title, duration, audio URL, position (order), and optional cover art. Drives the media player's track list and audio playback.
- **Url**: An external link associated with a release, typed by platform (BANDCAMP, SPOTIFY, etc.). The Bandcamp URL is used to link release cards to the external purchase/streaming page.

## Success Criteria _(mandatory)_

### Measurable Outcomes

- **SC-001**: Users can find a specific release by searching for an artist name, release title, or group name within 5 seconds of starting to type.
- **SC-002**: Users can navigate from the releases listing page to a playable release media player in 2 clicks or fewer (search → card "Play" button → player page).
- **SC-003**: The releases page loads and renders all published release cards within 3 seconds on a standard mobile connection (3G/4G).
- **SC-004**: 95% of users successfully play a release track on their first attempt after landing on the media player page.
- **SC-005**: The media player page provides a consistent listening experience that matches the landing page's featured artists player in visual design and interaction patterns.
- **SC-006**: Both pages score 90+ on Lighthouse accessibility audit (mobile and desktop).
- **SC-007**: Both pages render correctly on viewports from 320px to 1920px wide with no horizontal overflow, unreadable text, or inaccessible controls.
- **SC-008**: Search results update in under 500ms after the user stops typing, providing near-instant feedback.
- **SC-009**: The "other releases by this artist" carousel displays all relevant releases and allows smooth horizontal navigation on both desktop (arrows) and mobile (swipe).

## Assumptions

- **Published releases only**: The releases page and media player only display releases that have a `publishedAt` date set and `deletedOn` is null. Unpublished or soft-deleted releases are excluded.
- **Cover art fallback chain**: release coverArt → release images[0].src → styled text placeholder (per research decision R-008; artist images excluded as potentially confusing).
- **Artist display name fallback chain**: Reuse the established pattern — artist displayName → firstName + " " + surname → group displayName → "Unknown Artist".
- **Bandcamp URL derivation**: The Bandcamp URL is sourced from the release's associated `Url` records where `platform === 'BANDCAMP'`. If no Bandcamp URL is present, the card link is omitted.
- **Search is client-side filtering of server-fetched data**: For the initial implementation, all published releases are fetched server-side and the combobox dropdown filtering happens on the client. The card grid is not filtered — it always shows all releases. If the catalog grows beyond ~500 releases, search should be moved to a server-side endpoint.
- **Audio playback uses the existing media player**: No new audio infrastructure is needed. The existing `MediaPlayer` compound component and Video.js integration will be reused.
- **Mobile-first breakpoints**: Follow the existing Tailwind breakpoint system (sm: 640px, md: 768px, lg: 1024px, xl: 1280px).
- **No authentication required**: The releases page and media player page are public-facing and do not require user authentication.
- **Debounce**: Search input is debounced at 300ms to reduce unnecessary filtering operations.
- **New tab for Bandcamp**: Clicking the Bandcamp link opens in a new tab (`target="_blank"` with `rel="noopener noreferrer"`) to keep the user on the site.

## Scope & Boundaries

### In Scope

- Public releases listing page with card grid and search combobox
- Release media player page with full audio playback
- "Other releases by artist" carousel on the media player page
- Release description/blurb section below the media player
- Breadcrumb navigation on both pages
- Mobile-first responsive design
- Empty states and error handling for all edge cases

### Out of Scope

- Admin CRUD for releases (already exists)
- User accounts, favorites, or playlists
- Social sharing of releases
- Download functionality
- Comments or reviews on releases
- Analytics or tracking of play counts
- Pagination of the releases listing (initial load shows all published releases; pagination can be added later if the catalog grows)
- Server-side search (client-side filtering is sufficient for the initial catalog size)
