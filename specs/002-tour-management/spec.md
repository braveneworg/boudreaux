# Feature Specification: Tour Date Management System

**Feature Branch**: `develop/feature/tours`
**Created**: March 7, 2026
**Status**: Draft
**Input**: User description: "build a tour date management page in the admin section of the site that captures tour info such as title, subtitle, subtitle2, ticketsUrl, description, notes, headliners, venues, dates, show start/end times, ticket prices, artist display name with fallback to group display name if a related group exists and then to artist first and surname, and tour images/art that I can upload. I want to redisplay this information on tours page that has a search for touring artists and displays most recent tours first."

## User Scenarios & Testing _(mandatory)_

### User Story 1 - Admin Creates Tour Dates (Priority: P1)

An administrator logs into the admin section and creates a new tour entry by filling in tour details including title, subtitles, venue information, dates, times, ticket information, and associated headliners. The tour data is saved and can be edited or deleted later.

**Why this priority**: Core functionality that enables all other features. Without the ability to create and manage tour data, no tours can be displayed to users. This represents the fundamental CRUD operations needed for the feature.

**Independent Test**: Admin can log in, navigate to tour management page, create a new tour with all required fields, save it, and verify it appears in the tour list. Can be demonstrated independently without search or public display features.

**Acceptance Scenarios**:

1. **Given** an authenticated admin user is on the tour management page, **When** they click "Create Tour" and fill in all required fields (title, venue, dates, times), **Then** the tour is saved successfully and appears in the admin tour list
2. **Given** an admin has created a tour, **When** they edit the tour details and save, **Then** the updated information is persisted correctly
3. **Given** an admin views the tour list, **When** they delete a tour, **Then** the tour is removed from the system
4. **Given** an admin is creating a tour, **When** they leave required fields empty and attempt to save, **Then** validation errors are displayed indicating which fields need completion

---

### User Story 2 - Admin Uploads Tour Artwork (Priority: P2)

An administrator uploads and manages promotional images and artwork for each tour. Images can be added during tour creation or edited later. Multiple images can be associated with a single tour.

**Why this priority**: Visual elements are important for user engagement but the feature can function without images initially. This represents an enhancement to the core tour data management.

**Independent Test**: Admin can create a tour, upload one or more image files, preview them, and the images are stored and associated with the tour. Can be tested by creating a tour and verifying image upload without requiring public display.

**Acceptance Scenarios**:

1. **Given** an admin is creating or editing a tour, **When** they select and upload an image file, **Then** the image is uploaded successfully and displayed in a preview
2. **Given** a tour has associated images, **When** an admin views the tour in the admin interface, **Then** all uploaded images are displayed
3. **Given** an admin is managing tour images, **When** they delete an image, **Then** the image is removed from the tour
4. **Given** an admin attempts to upload an invalid file type, **When** they select a non-image file, **Then** an error message indicates only image files are allowed

---

### User Story 3 - Public Views Tours by Date (Priority: P3)

A visitor navigates to the tours page and sees all upcoming and recent tours displayed in reverse chronological order (most recent first). Each tour shows key information including title, venue, dates, headliners, and associated artwork.

**Why this priority**: This delivers value to end users by making tour information publicly accessible. It depends on tour data existing but provides the primary user-facing value of the feature.

**Independent Test**: Create several tours with different dates, navigate to the public tours page, and verify tours appear sorted with most recent first. All tour details are displayed correctly including images and artist names.

**Acceptance Scenarios**:

1. **Given** multiple tours exist in the system, **When** a visitor loads the tours page, **Then** tours are displayed sorted by startDate descending (most recent date first)
2. **Given** a visitor views a tour listing, **When** they see the tour details, **Then** all public information is displayed including title, subtitles, venue, dates, times, prices, headliners, and images
3. **Given** a tour has associated headliners, **When** the tour is displayed, **Then** artist names are shown using the display name with fallback to group name or first/last name as configured
4. **Given** a tour has a tickets URL, **When** displayed on the tours page, **Then** users can click to access ticket purchasing

---

### User Story 4 - Public Searches for Tours (Priority: P4)

A visitor uses the search feature on the tours page to find tours by artist name or other tour details. Search results are filtered in real-time and maintain the chronological sort order.

**Why this priority**: Enhances discoverability but the basic tour display provides value without search. This is a quality-of-life improvement for users with many tours available.

**Independent Test**: Navigate to tours page, enter an artist name in the search field, and verify only matching tours are displayed. Clear search to see all tours again.

**Acceptance Scenarios**:

1. **Given** a visitor is on the tours page, **When** they enter an artist name in the search field, **Then** only tours featuring that artist are displayed
2. **Given** search results are displayed, **When** the visitor clears the search, **Then** all tours are shown again
3. **Given** a visitor searches for a term, **When** no tours match, **Then** a friendly message indicates no results found
4. **Given** a visitor searches for a partial artist name, **When** the search executes, **Then** all tours with artists matching the partial name are displayed

---

### Edge Cases

- What happens when a tour has no associated venue? Display "Venue TBA" or similar placeholder
- What happens when tour end time is before start time? Validation should prevent saving invalid time ranges
- What happens when a tour date is in the past? Display on tours page but consider visual indicator for past vs. upcoming tours
- What happens when an artist has no group association and no display name? Fall back to first name + surname as specified
- What happens when image upload fails? Show error message and allow retry without losing other form data
- What happens when multiple tours have the same date? Sort by time or creation order as secondary sort
- What happens when ticket URL is invalid or empty? Display ticket information without link, or hide ticket section if no URL provided
- What happens when very long descriptions are entered? Consider character limits or text truncation in list views
- What happens when admin deletes a tour that has associated images? Images should be cleaned up to avoid orphaned files

## Requirements _(mandatory)_

### Functional Requirements

- **FR-001**: System MUST provide an admin interface for creating, reading, updating, and deleting tour entries
- **FR-002**: System MUST capture tour title, subtitle, subtitle2, description, and notes as text fields
- **FR-003**: System MUST capture ticketsUrl as a URL field for linking to external ticket purchasing
- **FR-004**: System MUST support associating one or more headliners (artists) with each tour
- **FR-005**: System MUST capture venue information for each tour
- **FR-006**: System MUST capture tour dates including start date and optional end date
- **FR-007**: System MUST capture show start time and end time for each tour
- **FR-008**: System MUST capture ticket pricing information for each tour as flexible text (e.g., "$25", "$20-$50", "Free", "Starting at $30") with a maximum of 100 characters
- **FR-009**: System MUST support uploading and storing multiple images/artwork files for each tour
- **FR-010**: System MUST implement artist display name logic with the following fallback sequence:
  1. Use artist.displayName if non-null and non-empty
  2. Else if artist has related group: use group.displayName if non-null and non-empty
  3. Else if artist.firstName and artist.surname exist: use "[firstName] [surname]"
  4. Else if only artist.firstName exists: use firstName alone
  5. Else if only artist.surname exists: use surname alone
  6. Else use "Unknown Artist" as final fallback
- **FR-011**: System MUST provide a public tours page displaying all tours sorted by date (most recent first)
- **FR-012**: System MUST provide search functionality on the public tours page to filter tours by artist name
- **FR-013**: System MUST restrict tour management operations to authenticated admin users
- **FR-014**: System MUST validate required fields before allowing tour creation or updates
- **FR-015**: System MUST validate that end times occur strictly after start times (equal values not allowed); specifically, showEndTime MUST be greater than showStartTime, and endDate MUST be greater than or equal to startDate
- **FR-016**: System MUST validate that uploaded files are image formats
- **FR-017**: System MUST handle image cleanup when tours are deleted to prevent orphaned files
- **FR-018**: Public tours page MUST display tour information without requiring authentication
- **FR-019**: System MUST display all tour details including title, subtitles, description, notes, venue, dates, times, prices, headliners, and images on the public page
- **FR-020**: System MUST persist all tour data reliably for retrieval and display

### Key Entities

- **Tour**: Represents a tour event with promotional and scheduling information
  - Title (main tour name)
  - Subtitle and subtitle2 (additional descriptive text)
  - Description (detailed tour information)
  - Notes (additional information or disclaimers)
  - Tickets URL (link to purchase tickets)
  - Start date and optional end date
  - Show start time and end time
  - Ticket prices (pricing information)
  - Created/updated timestamps for sorting and audit
  - Relationships: associated with one or more Artists (headliners), one Venue, and zero or more Images

- **Artist**: Represents a performing artist or group
  - Display name (preferred public name)
  - First name and surname (fallback name components)
  - Relationships: may be associated with a Group, can headline multiple Tours

- **Group**: Represents a musical group or band
  - Display name (group's public name)
  - Relationships: may include multiple Artists as members

- **Venue**: Represents a performance location
  - Name (required): Official venue name
  - Address (optional): Street address
  - City (required): City location
  - State/Province (optional): State or province
  - Country (optional): Country
  - Postal Code (optional): ZIP or postal code
  - Capacity (optional): Maximum venue capacity
  - Notes (optional): Additional venue information
  - Relationships: hosts multiple Tours

- **Tour Image**: Represents promotional artwork for a tour
  - Image file reference or URL
  - Upload timestamp
  - Display order (if multiple images per tour)
  - Relationships: belongs to one Tour

## Success Criteria _(mandatory)_

### Measurable Outcomes

- **SC-001**: Admin users can create a complete tour entry with all fields in under 5 minutes
- **SC-002**: Admin users can upload and associate tour artwork with a tour in under 2 minutes
- **SC-003**: Public users can find a specific tour by searching for an artist name in under 30 seconds
- **SC-004**: Tours page loads and displays all tours within 3 seconds for up to 200 tour entries
- **SC-005**: 95% of tour creation attempts result in successful save with valid data
- **SC-006**: Public users can view complete tour information including all details and images without errors
- **SC-007**: Search functionality returns accurate results matching artist names with 100% precision
- **SC-008**: Image uploads complete successfully for files up to 10MB in under 10 seconds
- **SC-009**: Tours are consistently displayed in correct chronological order (most recent first) on the public page
- **SC-010**: Admin users can edit and update existing tour information with changes reflected immediately on the public page
- **SC-011**: Zero orphaned image files remain after tour deletion operations
- **SC-012**: Artist name display follows correct fallback logic (display name → group name → first/last name) in 100% of cases

## Assumptions

The following assumptions have been made to fill gaps in the feature description with reasonable defaults:

1. **Authentication**: Assumes existing authentication system is in place for admin users. Admin access control will leverage existing auth mechanisms.

2. **Pre-existing Data Models**: Assumes Artist and Group data models already exist in the Prisma schema with the following minimum fields:
   - Artist: id, displayName (nullable), firstName (nullable), surname (nullable), relationships to Group
   - Group: id, displayName (nullable), relationships to Artist members
     These models will be extended with tourHeadliners relationship but not created from scratch.

3. **Required vs Optional Fields**: Assumes the following fields are required for tour creation:
   - Title
   - At least one headliner (artist)
   - Venue
   - Start date
   - Show start time
     All other fields (subtitle, subtitle2, notes, end date, end time, ticket prices, ticketsUrl, images) are optional.

4. **Search Scope**: Search functionality will match against artist/headliner names only using case-insensitive partial matching. Future iterations could expand to search titles, venues, or descriptions.

5. **Image Formats**: Supported image formats are JPEG, PNG, GIF, and WebP. Common web-safe image formats.

6. **Image Upload Limits**: Maximum file size of 10MB per image. Maximum of 10 images per tour to prevent storage issues.

7. **Date Display**: "Most recent first" refers to tours with the most recent start date appearing first. If a tour spans multiple dates, the start date is used for sorting. For tours with identical start dates, secondary sort by showStartTime, then by createdAt timestamp.

8. **Past Tours**: Past tours (with start dates before current date) will still be displayed on the public page. No automatic archiving or hiding of past tours.

9. **Venue Data**: Venue information is captured as part of tour creation. Assumes venues can be selected from existing venue records or new venues can be created inline during tour creation via a dialog.

10. **Ticket Prices**: Ticket pricing is stored as flexible text to accommodate various pricing formats (e.g., "$25", "$20-$50", "Free", "Starting at $30") with a 100 character maximum.

11. **Timezone Handling**: Show start and end times are stored in the venue's local timezone. Display adjusts based on user location if applicable.

12. **Character Limits**: Reasonable character limits will be enforced:
    - Title: 200 characters
    - Subtitle/subtitle2: 150 characters each
    - Description: 5000 characters
    - Notes: 2000 characters

## Scope

### In Scope

- Admin CRUD interface for tour management
- Capture all specified tour fields (title, subtitles, description, notes, dates, times, prices, ticketsUrl)
- Multi-image upload and management for tours
- Artist/headliner association with tours
- Venue association with tours (including inline venue creation during tour creation)
- Public tours display page
- Chronological sorting (most recent first)
- Artist name search functionality
- Artist display name fallback logic
- Form validation for admin inputs
- Image file type validation
- Responsive design for both admin and public interfaces
- Image cleanup on tour deletion

### Out of Scope

- Artist management interface (creating/editing artist records)
- Group management interface (creating/editing group records)
- Standalone venue management interface (separate CRUD pages for venues; inline creation during tour creation IS in scope)
- Ticket sales or e-commerce functionality (link to external ticketing only)
- Calendar view of tours
- Map view showing tour locations
- Social media integration or sharing
- Email notifications for new tours
- Tour analytics or reporting
- Multi-language support
- User favorites or saved tours
- Comments or reviews on tours
- Tour recommendations or related tours
- Advanced search filters (by date range, location, price, etc.)
- Export functionality (CSV, PDF)
- Bulk import of tours
- Tour templates or duplication
- Version history or audit log for tour changes

## Dependencies

- Existing authentication and authorization system for admin access
- Existing Artist and Group data models (or creation of these models)
- Existing Venue data model (or creation of this model)
- File storage system for image uploads
- Database system for persisting tour data
