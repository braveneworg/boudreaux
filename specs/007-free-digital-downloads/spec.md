# Feature Specification: Free Digital Format Downloads (MP3 320 + AAC)

**Feature Branch**: `007-free-digital-downloads`
**Created**: 2026-05-06
**Status**: Draft
**Input**: User description: "When a user clicks the download link button on the landing page, it currently shows a dialog to download MP3 320Kbps for free as one of the radio button choices; however this flow is not yet fully implemented. It should also permit them to download AAC digital format files. The MP3 files are not signed urls but the AAC files are. In any case they should be taken directly to the download digital formats portion of the download dialog, and shown only the two digital formats in the combo box select dropdown. They must select at least one digital format in order for the download button to be enabled. Show a message at the top of the dialog instructing user to select one or both free formats. Once they have selected the formats and clicked download button, show the progress spinners and make the download work like the release downloads so that the download also works in iOS."

## User Scenarios & Testing _(mandatory)_

### User Story 1 - Guest selects and downloads free digital formats from landing page (Priority: P1)

A visitor lands on the public landing page, clicks the download button for a release, and chooses the "Free" option in the existing radio selector. The dialog advances to a free-formats selection step that lists only the two free digital formats — MP3 320Kbps and AAC. The visitor must select at least one format before the download button becomes enabled. After clicking download, per-format progress indicators appear, the bundle is prepared, and a single download is delivered in a way that succeeds on iOS Safari as well as desktop browsers.

**Why this priority**: This is the primary user value — the existing free download radio choice is currently a dead-end stub. Without it, every guest visitor who chooses the free tier from the landing page hits a non-functional flow. Shipping this story alone delivers a complete, demonstrable MVP: guests can obtain free music in their preferred lossy format directly from the landing page without an account.

**Independent Test**: Open the landing page as an anonymous visitor in mobile Safari (iOS), open the download dialog for any release that has both MP3 320Kbps and AAC digital formats published, choose the free option, select one or both formats, and verify the file(s) download successfully and persist in the device's Files app.

**Acceptance Scenarios**:

1. **Given** an anonymous visitor opens the landing page download dialog and the underlying release has both free formats published, **When** they select the "Free" radio option, **Then** the dialog advances directly to a format-selection step whose combobox contains exactly two options: MP3 320Kbps and AAC.
2. **Given** the format-selection step is open with no formats selected, **When** the visitor views the dialog, **Then** an instructional message at the top reads "Select one or both free formats to download." and the download button is disabled.
3. **Given** the visitor has selected at least one of the two free formats, **When** they click the download button, **Then** the button activates and per-format progress indicators appear for each selected format.
4. **Given** the visitor has selected both formats and started the download, **When** the bundle is prepared server-side, **Then** a single combined archive is delivered using the same iOS-compatible delivery mechanism used by paid release downloads.
5. **Given** the visitor selected only MP3 320Kbps, **When** the download is delivered, **Then** the URL used is the unsigned, CDN-cacheable URL (consistent with current MP3 320 distribution).
6. **Given** the visitor selected AAC (alone or together with MP3), **When** the download is delivered, **Then** the AAC file content is served via a presigned URL with a 24-hour download expiration.

---

### User Story 2 - Per-release download cap is enforced for free downloads (Priority: P2)

A visitor who has already downloaded a release the maximum number of times within the current cooldown window attempts to download again via the free flow. The dialog must communicate the cap and the time until reset, and prevent the download from proceeding, exactly as the paid flow already does.

**Why this priority**: Free downloads must respect the same per-release download limit and cooldown as paid downloads to prevent abuse and keep distribution metrics consistent. Without this, the free path becomes an exploit vector around the cap. This depends on US-1 but is a small additional surface.

**Independent Test**: Trigger the free flow as a visitor whose download count for the chosen release equals the configured maximum, and verify the format-selection step shows the "Download limit reached" state with reset countdown text instead of an active download button.

**Acceptance Scenarios**:

1. **Given** a visitor's per-release download count for the target release is at the maximum, **When** they reach the free-formats selection step, **Then** the download button is replaced with a disabled "Download limit reached" state and a message explaining when the limit resets (in hours).
2. **Given** the visitor has remaining downloads in the current window, **When** they complete a free download successfully, **Then** their download count for that release increases by one, just as a paid download would.

---

### User Story 3 - Per-release cap applies uniformly across both free formats (Priority: P3)

The per-release download cap applies to AAC and MP3 320Kbps on the same terms, with no separate cross-release AAC quota. When the per-release cap is reached for a given release, both free formats are blocked for that release until the rolling 24-hour window advances.

**Why this priority**: Treating both free formats under a single per-release cap keeps the model simple, removes a separate quota subsystem, and aligns the bandwidth-cost envelope with abuse-resistance via the per-release cap and per-IP rate limit. This is a refinement on top of US-1 and US-2.

**Independent Test**: As a visitor who has reached the per-release cap (3 successful downloads in the trailing 24 hours) for a given release, open the free-formats dialog and verify both AAC and MP3 320Kbps options are blocked with the "Download limit reached" state and reset countdown, while a different release for which the visitor has remaining capacity still permits free downloads.

**Acceptance Scenarios**:

1. **Given** a visitor has reached the per-release cap for release A, **When** they open the free-formats selection step for release A, **Then** both AAC and MP3 320Kbps options are blocked with the "Download limit reached" state and reset countdown.
2. **Given** a visitor has reached the per-release cap for release A but has remaining capacity for release B, **When** they open the free-formats selection step for release B, **Then** both AAC and MP3 320Kbps options remain selectable subject to per-release availability.
3. **Given** AAC and MP3 320Kbps are both selected and the bundle delivers successfully, **When** the per-release counter is incremented, **Then** the increment is exactly one (one bundle = one count), not one per format.

---

### Edge Cases

- What happens when the target release has only one of the two free formats published (e.g., MP3 320 exists but AAC has not been uploaded)? The combobox MUST show only the available format and the instructional message MUST remain accurate.
- What happens when the target release has neither free format published? The free flow MUST surface a clear "no free formats available for this release" state rather than a blank combobox.
- What happens if the bundle preparation fails mid-stream (e.g., S3 read error for the AAC file)? The dialog MUST surface a user-readable error and allow the visitor to retry without leaving the dialog.
- What happens when the visitor closes the dialog mid-download? In-flight progress MUST be cancelled and dialog state MUST reset on next open.
- What happens on iOS Safari when the user taps download from the dialog? The delivery mechanism MUST be the same one already used by paid release downloads (no anchor `download` attribute reliance), so the file is saved to Files.app rather than rendered inline or silently failing.
- What happens when the same visitor opens the dialog twice in quick succession and starts two free downloads concurrently for the same release? Bundle preparation MUST be serialized per (visitor, release) with a short server-side lock (~30 seconds); if the first preparation finishes within the lock window, the second request reuses the cached bundle and both deliveries count against the per-release cap; if it does not, the second request MUST receive a user-readable "Another download is already preparing" error without incrementing the cap.
- What happens if AAC presigned-URL generation fails while MP3 320 is also selected? The bundle MUST fail as a single unit and report the error; partial bundles MUST NOT be delivered.

## Clarifications

### Session 2026-05-07

- Q: How should the system identify an anonymous visitor for per-release cap enforcement across sessions? → A: Composite — long-lived first-party cookie ID + per-IP rate limit + server-side fingerprint hash (UA + accept-language + IP /24).
- Q: What should the dialog do when a free attempt is blocked by the per-release cap? → A: Disabled state + reset countdown + single CTA linking to existing premium/sign-in path.
- Q: How should concurrent free downloads by the same visitor for the same release be handled? → A: Serialize per (visitor, release) with a short server-side lock (~30s); reuse cached bundle when available; second concurrent attempt errors if no cache hit.
- Q: What are the per-release cap and cooldown window for free downloads? → A: 3 downloads per release per 24-hour rolling window.
- Q: What is the freemium AAC quota (cross-release) for an anonymous visitor? → A: No separate cross-release AAC quota — AAC is governed solely by the per-release cap (FR-011).

### Session 2026-05-08

- Q: When a request's cookie resolves to VisitorA but its fingerprint resolves to a different existing VisitorB, how should the per-release cap be computed? → A: Compute the cap from the union of both visitors' `DownloadEvent` rows for the target release in the trailing 24h window; do not merge or mutate the visitor records.
- Q: What unit/format should the cap-block countdown render in? → A: Auto-scale `Hh Mm` / `Mm` / `Ss` and tick live every second.
- Q: When does a free download count as "successful" for the per-release cap? → A: On bundle-ready — the `DownloadEvent` row is written server-side when the bundle finishes assembly, just before the delivery URL / SSE `ready` is emitted; client streaming success/failure does not affect the cap.
- Q: How should the dialog handle a release that has no free formats published? → A: Disable the "Free" radio on the prior step with hint "Not available for this release"; the FR-015 "no free formats available" empty state remains only as a defensive fallback.
- Q: Does the per-release 3/24h cap apply to signed-in users on the free flow? → A: Yes — signed-in users are subject to the same 3/24h cap, keyed by `userId` instead of the composite anonymous-visitor identity.

## Requirements _(mandatory)_

### Functional Requirements

- **FR-001**: The download dialog opened from the landing page MUST continue to present the existing radio choices, including a "Free" option, on its initial step.
- **FR-002**: When the visitor selects the "Free" radio option and proceeds, the dialog MUST advance directly to a digital-formats selection step that lists only MP3 320Kbps and AAC.
- **FR-003**: The free-formats selection step MUST display an instructional message at the top reading exactly: "Select one or both free formats to download."
- **FR-004**: The download button on the free-formats selection step MUST be disabled until at least one format is selected, and MUST become enabled as soon as one or both formats are selected.
- **FR-005**: When MP3 320Kbps is included in the download, the system MUST deliver the file via the existing unsigned, CDN-cacheable URL strategy currently used for MP3 320Kbps elsewhere in the product.
- **FR-006**: When AAC is included in the download, the system MUST deliver the AAC content via a presigned URL with a 24-hour download expiration, consistent with the platform's existing 24-hour download presigning convention.
- **FR-007**: When the visitor selects both MP3 320Kbps and AAC, the system MUST deliver a single combined archive using the same bundling and delivery mechanism used for paid release downloads.
- **FR-008**: While the download is being prepared and delivered, the dialog MUST display per-format progress indicators that mirror the paid release-download progress UX.
- **FR-009**: The download delivery mechanism MUST work on iOS Safari, using the same iOS-compatible delivery approach already used by paid release downloads.
- **FR-010**: The free flow MUST be available to anonymous visitors without requiring sign-in or email capture. Authenticated users MAY also use the free flow; when they do, cap enforcement uses their `userId` as the identity key (see FR-019).
- **FR-011**: Each successful free download MUST increment the per-release download counter for the visitor. The cap is **3 successful downloads per release per visitor per rolling 24-hour window**; once 3 successful downloads have been recorded within the preceding 24 hours, additional attempts MUST be blocked until the oldest of those 3 falls outside the 24-hour window. A download is "successful" for cap purposes the moment the server finishes assembling the bundle and is about to emit the delivery URL / SSE `ready` event; the `DownloadEvent` row MUST be written at that point. Client-side streaming outcome (network failure, user cancel after `ready`) MUST NOT affect the cap.
- **FR-012**: When the per-release maximum (3 in the rolling 24-hour window) is reached, the free-formats selection step MUST show a disabled "Download limit reached" state with a live countdown to when the next slot frees up (i.e., the time until the oldest of the 3 successful downloads falls outside the 24-hour window) AND a single CTA linking to the existing premium/sign-in path. The countdown MUST auto-scale its display: `Hh Mm` when ≥ 1 hour remains, `Mm` when < 1 hour and ≥ 1 minute remains, `Ss` when < 1 minute remains; it MUST tick live every second on the client. The dialog itself MUST remain open and navigable.
- **FR-013**: AAC free downloads MUST be governed by the per-release cap defined in FR-011 (3 successful downloads per release per visitor per rolling 24-hour window). No additional cross-release freemium quota applies to AAC for the purposes of this feature. MP3 320Kbps free downloads are governed by the same per-release cap.
- **FR-014**: When the per-release cap is reached for a release, both AAC and MP3 320Kbps options MUST be disabled with the "Download limit reached" state described in FR-012. When a release publishes only one of the two free formats, the unpublished format MUST simply not appear in the combobox (per FR-015).
- **FR-015**: When a release has only one of the two free formats published, the combobox MUST list only the published format(s). When a release has neither free format published, the "Free" radio option on the prior radio step MUST be rendered in a disabled state with the hint "Not available for this release", preventing the visitor from advancing to the format-selection step. The "no free formats available" empty state inside the format-selection step is retained ONLY as a defensive fallback and MUST NOT be the primary path for this case.
- **FR-016**: Closing the dialog mid-download MUST cancel any in-flight delivery and reset dialog state on the next open.
- **FR-017**: Bundle delivery failures (e.g., AAC presigning failure when both formats are selected) MUST be surfaced as a user-readable error inside the dialog and MUST permit a retry without leaving the dialog.
- **FR-018**: The free flow MUST NOT bypass any existing authentication, authorization, or rate-limiting safeguards that protect the paid download endpoints.
- **FR-019**: For anonymous visitors, the system MUST identify the visitor across sessions using a composite key: (a) a long-lived first-party HTTP cookie issued server-side on first dialog open (`Secure`, `HttpOnly`, `SameSite=Lax`, ~1-year expiry), (b) a per-IP rate-limit applied by the existing rate-limit decorator at the bundle endpoint, and (c) a server-side fingerprint hash derived from User-Agent, Accept-Language, and the /24 prefix of the client IP. Per-release cap lookups MUST treat any match on the cookie OR the fingerprint hash as the same visitor. When the cookie resolves to one visitor record and the fingerprint hash resolves to a different existing visitor record, the per-release cap MUST be computed from the union of both records' `DownloadEvent` rows in the trailing 24-hour window for the target release; the visitor records themselves MUST NOT be merged or mutated as a side effect of this resolution. For authenticated users on the free flow, the cap identity key MUST be the `userId` (composite anonymous identity is not consulted), and the same 3/24h per-release cap defined in FR-011 MUST apply.
- **FR-020**: If the visitor has no cookie at the start of the free flow, the system MUST issue one before recording any download against the cap, so that the first free download is reliably attributable.
- **FR-021**: Bundle preparation MUST be serialized per (visitor, release) with a short server-side lock (~30 seconds). A second concurrent free-download request from the same visitor for the same release MUST reuse the cached bundle when preparation completes within the lock window, or return a user-readable "Another download is already preparing" error otherwise. The cap MUST NOT be incremented for requests rejected by this lock.

### Key Entities

- **Free Download Selection**: The set of one or two formats (MP3 320Kbps and/or AAC) the visitor has chosen on the free-formats step. Drives whether the download button is enabled and which delivery paths are exercised.
- **Per-Release Download Counter**: The existing per-release counter governing the maximum number of downloads per visitor and the reset cooldown. Free downloads contribute to it on the same terms as paid downloads.
- **Freemium AAC Quota**: Not used by this feature. AAC free downloads are governed by the per-release download counter only; no cross-release quota applies. Retained here as an explicit non-entity to prevent reintroduction.
- **Free Format Availability**: Per release, the published-or-not state of MP3 320Kbps and AAC digital formats. Determines which entries appear in the free-formats combobox.
- **Anonymous Visitor Identity**: Composite identity for unauthenticated visitors used as the lookup key for the per-release cap. Composed of a long-lived first-party cookie ID, a fingerprint hash (UA + Accept-Language + IP /24), and the per-IP rate-limit window. A match on cookie OR fingerprint resolves to the same visitor record.

## Success Criteria _(mandatory)_

### Measurable Outcomes

- **SC-001**: At least 95% of users who select the "Free" radio option from the landing-page download dialog successfully complete a free download on first attempt, across desktop and iOS Safari.
- **SC-002**: 100% of free downloads delivered to iOS Safari users save to the device's Files app rather than rendering inline or silently failing.
- **SC-003**: Median time from clicking the download button to file delivery starting is under 5 seconds for single-format selections and under 10 seconds for combined two-format selections.
- **SC-004**: Zero free downloads bypass the per-release maximum download count or its reset cooldown.
- **SC-005**: Zero free downloads (AAC or MP3 320Kbps) succeed for a visitor on a release after that visitor has reached the per-release cap of 3 in the trailing 24-hour window.
- **SC-006**: The download button on the free-formats step is disabled in 100% of states where zero formats are selected, and enabled in 100% of states where at least one format is selected.
- **SC-007**: Support tickets relating to "free download from landing page does nothing" or "iOS download fails" drop to zero within 30 days of release.

## Assumptions

- The existing landing-page download dialog and its radio-choice step (with "Free" as one option) remain the entry point; no new entry points are introduced by this feature.
- The existing iOS-compatible delivery mechanism used by paid release downloads (e.g., the bundle SSE + JSON-mode flow with triggerDownload) is the same mechanism the free flow will reuse.
- The existing per-release maximum download count and cooldown settings are reused unchanged; no new configuration values are introduced for the free flow.
- This feature does not consume the freemium AAC quota mechanism from feature 004; AAC free downloads are governed solely by the per-release cap (FR-011).
- MP3 320Kbps URLs continue to be served unsigned and CDN-cached as established by prior work referenced in the changelog ("make mp3 320 urls unsigned but cached").
- The combobox UI used for paid format selection (the multi-combobox component) is the appropriate UI for the free-formats step as well, with the option set restricted to the two free formats.
- Releases that publish digital formats independently control which of the two free formats are available; the free flow reflects whatever is currently published per release without administrative changes for this feature.
- "Both formats selected" delivery is a single archive rather than two separate downloads, in order to mirror the paid flow's UX and avoid two browser-blocked download prompts on iOS.
