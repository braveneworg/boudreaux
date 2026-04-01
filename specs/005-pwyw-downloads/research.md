# Research: PWYW Downloads — Post-Purchase Format Selection

**Feature**: 005-pwyw-downloads
**Date**: 2026-04-01

## Research Questions & Findings

### R1: How does the post-purchase flow currently work?

**Decision**: The `PurchaseCheckoutStep` calls `onConfirmed()` after
polling `/api/releases/[id]/purchase-status` confirms the webhook wrote
the purchase record. This triggers `setStep('purchase-success')` in the
parent `DownloadDialog`. The `PurchaseSuccessStep` currently renders a
static `<Link>` to the legacy download route.

**Rationale**: The `onConfirmed` callback is the natural integration point.
Instead of transitioning to `purchase-success`, we transition to a new
step (or modify `purchase-success`) that shows the format picker.

**Alternatives considered**:

- Adding a new dialog step `post-purchase-format-select` — rejected
  because it adds unnecessary state; modifying the existing
  `purchase-success` step to embed `FormatBundleDownload` is simpler.
- Redirecting to a separate page — rejected because the dialog is the
  established UX pattern and keeps the user in context.

### R2: Can FormatBundleDownload be reused directly in PurchaseSuccessStep?

**Decision**: Yes. `FormatBundleDownload` is a self-contained component
that accepts `releaseId`, `releaseTitle`, `availableFormats[]`, and
`downloadCount`. It handles format selection via ToggleGroup, download
via anchor-triggered GET to the bundle route, and loading state.

**Rationale**: The component was designed for reuse in the `format-select`
step. All props are already available in the dialog's state. The
`availableFormats` prop flows from the parent `DownloadDialog` which
receives it from the server-side release page.

**Alternatives considered**:

- Building a new component — rejected; duplication with no added value.
- Using `FormatDownloadList` (individual downloads) — rejected per user
  requirement for multi-select ZIP bundle.

### R3: How should guest returning purchasers access format selection?

**Decision**: The `returning-download` step currently shows a static
legacy download link. Update it to show `FormatBundleDownload` instead
when `availableFormats.length > 0` and the user is not at the download
cap. Guest returning purchasers already have their purchase verified via
`checkGuestPurchaseAction`.

**Rationale**: Consistent UX — all purchasers (new and returning, auth'd
and guest) see the same format picker experience.

**Alternatives considered**:

- Keep legacy link for guests — rejected; inconsistent UX and still uses
  deprecated route.

### R4: What needs to change in the purchase confirmation email?

**Decision**: Replace the direct download URL
(`/api/releases/${releaseId}/download`) with a link to the release page
(`/releases/${releaseId}`) where the user can open the download dialog
and select formats. The email already includes the release title and
artist name for context.

**Rationale**: The legacy download route will be deprecated. The release
page provides the full format selection experience. Email clients can't
execute the multi-step format selection flow anyway.

**Alternatives considered**:

- Deep link with format params — rejected; email URLs should be stable
  and not depend on format availability at send time.
- Remove download link entirely — rejected; users expect a download link
  in purchase confirmations.

### R5: Should the legacy download route be removed or redirected?

**Decision**: Add a 301 redirect from `/api/releases/[id]/download` to
`/releases/[id]` (the public release page). This preserves existing
bookmarks and email links while guiding users to the new flow.

**Rationale**: Hard removal would break outstanding email links and any
cached bookmarks. A redirect is the standard deprecation pattern.

**Alternatives considered**:

- Keep both routes active — rejected; maintenance burden and inconsistent
  behavior.
- 410 Gone — rejected; users would see an error instead of being guided
  to the working download path.

### R6: Does the bundle route need any changes?

**Decision**: No. The existing bundle route at
`/api/releases/[id]/download/bundle` already:

- Authenticates the user
- Validates formats via Zod
- Verifies purchase
- Checks download limit (< 5)
- Fetches format records with S3 keys
- Streams ZIP with format-labeled directories
- Increments download count by 1
- Logs download events per format

This is exactly the behavior needed for post-purchase downloads.

**Alternatives considered**: None needed — the route is feature-complete
for this use case.

## Unresolved Questions

None. All research questions resolved with decisions above.
