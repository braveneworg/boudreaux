# Quickstart: Free Digital Format Downloads

**Feature**: `007-free-digital-downloads` | **Date**: 2026-05-07

This quickstart documents the manual verification path used by reviewers and QA to confirm the feature works end-to-end. Run after completing the implementation tasks.

## Prerequisites

- Local dev server running: `pnpm run dev`
- A test release in MongoDB that publishes both **MP3 320Kbps** and **AAC** digital formats. Use `pnpm exec prisma studio` to confirm.
- A clean browser profile (or Incognito + cleared cookies for `localhost:3000`).
- Stripe forwarding NOT required.

## Scenario 1 — Anonymous happy path (single format)

1. Open `http://localhost:3000/releases/{slug}` in a clean browser profile.
2. Click the download button to open the dialog.
3. Confirm the dialog shows the existing radio choices including **Free**.
4. Select **Free**. The dialog auto-advances to the free-formats step.
5. Confirm the heading message reads exactly: _"Select one or both free formats to download."_
6. Confirm the download button is **disabled** with no formats selected.
7. Select **MP3 320Kbps**. Confirm the button enables.
8. Click **Download**.
9. Confirm a single ZIP archive downloads to disk and the dialog shows per-format progress.
10. Open browser DevTools → Application → Cookies. Confirm `boudreaux_visitor_id` exists with `HttpOnly` and `SameSite=Lax`.

## Scenario 2 — Anonymous happy path (both formats)

1. Reload the release page.
2. Open dialog → Free → select **both** MP3 320Kbps and AAC → Download.
3. Confirm a single combined ZIP archive downloads.
4. In MongoDB, confirm two new `DownloadEvent` rows exist with `success=true` and the same `visitorId`.

## Scenario 3 — Cap enforcement (3 / 24h rolling window)

1. With the same anonymous visitor, repeat Scenario 1 two more times for the **same release** (total: 3 successful free downloads).
2. Open the dialog a fourth time. Select **Free**.
3. Confirm the free-formats step renders the **"Download limit reached"** disabled state.
4. Confirm a countdown is visible (e.g., _"Resets in 23h 58m"_) and that it ticks down each second.
5. Confirm a single CTA links to the existing premium / sign-in path.
6. Confirm the dialog itself remains open and dismissible.

## Scenario 4 — Cookie clear does NOT reset the cap

1. While in the cap-reached state from Scenario 3, clear cookies for `localhost:3000`.
2. Reload, reopen the dialog, choose Free.
3. Confirm the cap-reached state still appears (identity recovered via fingerprint hash).

## Scenario 5 — Concurrent downloads serialized (~30s lock)

1. From a fresh anonymous visitor on a release where you have not yet hit the cap.
2. Open two browser tabs, each on the same release.
3. In each tab, open the dialog and proceed to Free → MP3 320Kbps + AAC.
4. Click **Download** in tab 1, then **immediately** click **Download** in tab 2.
5. Tab 1 should download the bundle.
6. Tab 2 should either:
   - Reuse the cached bundle and download successfully (fast), or
   - Display the user-readable error "Another download is already preparing" (slower).
7. Confirm only **one** new `DownloadEvent` per format is written (the second tab's reuse counts; the second tab's lock-conflict does NOT).

## Scenario 6 — iOS Safari delivery

1. Open the same release on a real or emulated iOS Safari (e.g., Playwright `webkit` device emulation, iPhone 15 viewport, mobile Safari user agent).
2. Open dialog → Free → select MP3 320Kbps → Download.
3. Confirm the file saves to **Files.app** (not rendered inline, not silently failing). Per FR-009 / SC-002, the existing iOS-compatible delivery (SSE + JSON `triggerDownload`) is used.

## Scenario 7 — Release with no free formats published

1. Use Prisma Studio to set both digital format records for a test release to soft-deleted.
2. Open the dialog and select Free.
3. Confirm the "no free formats available for this release" state is shown rather than a blank combobox.

## Scenario 8 — Mid-download cancel

1. From a fresh visitor with cap budget remaining, start a both-format download.
2. Close the dialog mid-prep.
3. Reopen the dialog. Confirm dialog state is reset (no stale progress, no pending download).
4. Confirm at most one (or zero) `success=true` `DownloadEvent` rows exist for that attempt.

## Scenario 9 — Authenticated purchaser unaffected

1. Sign in as a user who has purchased the release.
2. Open dialog → choose the paid path → confirm download proceeds via the existing paid flow without any free-flow side effects (no `boudreaux_visitor_id` cookie issuance against an authenticated user, no new `DownloadEvent` rows recorded against a guest).

## Sign-off Checklist

- [ ] Scenarios 1–9 pass on Chromium (desktop)
- [ ] Scenarios 1, 3, 6 pass on `webkit` (iOS Safari emulation)
- [ ] No regressions in the paid bundle download flow
- [ ] `pnpm run test:run` green
- [ ] `pnpm run test:e2e` green for `e2e/tests/free-download.spec.ts`
- [ ] `pnpm run typecheck` green
- [ ] `pnpm run lint` clean
