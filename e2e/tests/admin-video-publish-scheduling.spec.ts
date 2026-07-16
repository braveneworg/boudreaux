/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { expect, test } from '../fixtures/auth.fixture';
import { scrollToLoad } from '../helpers/infinite-scroll';

/**
 * E2E coverage for the video publish-scheduling feature (Tasks 3 + 4).
 *
 * The scheduling gate: a video with `publishedAt > now` is "scheduled" — visible
 * in the admin list with a "Scheduled" badge, but EXCLUDED from the public
 * /videos listing (which requires `publishedAt <= now`).
 *
 * Assertions are driven by the deterministic seed (e2e/helpers/seed-test-db.ts):
 *
 * - "E2E Video Scheduled": publishedAt = 2099-01-01 (far future). Shows a
 *   Scheduled badge in /admin/videos; absent from the public /videos page.
 * - "E2E Video Alpha": publishedAt = 2026-01-10 (past). Shows a Published badge
 *   in /admin/videos and DOES appear on the public /videos page.
 *
 * Read-only: these specs never mutate the shared seed, so they stay parallel-safe.
 *
 * NOT covered here (infeasible without real S3 upload in the E2E harness):
 * - Creating a new video through the full create→schedule UI flow. The admin
 *   upload requires a real multipart S3 upload, which is unavailable in the E2E
 *   environment. The scheduling semantics are fully covered by unit tests in
 *   `src/lib/repositories/video-repository.spec.ts` and by the seeded fixture
 *   assertions below.
 */

test.describe('Video publish scheduling — Scheduled badge', () => {
  test('a future-dated video shows a Scheduled badge in /admin/videos (Task 4)', async ({
    adminPage,
  }) => {
    await adminPage.goto('/admin/videos');

    // Load all non-archived videos (two pages). Scroll to auto-load the footer
    // rather than clicking the transient "Load More" button, which races the
    // IntersectionObserver auto-load (see scrollToLoad).
    await scrollToLoad(
      adminPage,
      adminPage.getByRole('heading', { level: 3, name: 'E2E Video Scheduled' })
    );

    // The scheduled video (publishedAt = 2099) must appear with a Scheduled badge.
    // The card's heading is a level-3 heading; locate the card that contains it.
    const scheduledCard = adminPage.locator('[data-slot="card"]').filter({
      has: adminPage.getByRole('heading', { level: 3, name: 'E2E Video Scheduled' }),
    });
    await expect(scheduledCard).toHaveCount(1);
    await expect(scheduledCard.getByText('Scheduled', { exact: true })).toBeVisible();

    // It must NOT show Published or Draft — only Scheduled.
    await expect(scheduledCard.getByText('Published', { exact: true })).toHaveCount(0);
    await expect(scheduledCard.getByText('Draft', { exact: true })).toHaveCount(0);
  });

  test('a past-published video shows a Published badge in /admin/videos (Task 3)', async ({
    adminPage,
  }) => {
    await adminPage.goto('/admin/videos');

    // "E2E Video Alpha" has publishedAt = 2026-01-10 (in the past).
    const publishedCard = adminPage.locator('[data-slot="card"]').filter({
      has: adminPage.getByRole('heading', { level: 3, name: 'E2E Video Alpha' }),
    });
    await expect(publishedCard).toHaveCount(1);
    await expect(publishedCard.getByText('Published', { exact: true })).toBeVisible();
  });
});

test.describe('Video publish scheduling — public /videos gate', () => {
  test('a scheduled (future-dated) video does NOT appear on the public /videos page (Task 3)', async ({
    userPage,
  }) => {
    await userPage.goto('/videos');

    // Load all published public videos (scroll to trigger the second page).
    const lastCard = userPage
      .getByRole('article')
      .filter({ has: userPage.getByRole('heading', { level: 2, name: 'E2E Video Echo' }) });
    await expect(lastCard).toBeVisible();
    // Retry the scroll: tripping the IntersectionObserver re-renders the list
    // (appends page 2), which can transiently detach the grabbed node ("Element
    // is not attached to the DOM"). toPass re-resolves and re-scrolls until it lands.
    await expect(async () => {
      await lastCard.scrollIntoViewIfNeeded();
    }).toPass({ timeout: 15_000 });

    // Wait for infinite scroll to settle (Foxtrot + Golf pages in).
    await expect(
      userPage.getByRole('heading', { level: 2, name: 'E2E Video Foxtrot' })
    ).toBeVisible();

    // The scheduled video must never appear — publishedAt > now is excluded by
    // the publishedVisibleClause (publishedAt <= now) in the public API route.
    await expect(userPage.getByText('E2E Video Scheduled')).toHaveCount(0);
  });

  test('a normally-published (past) video DOES appear on the public /videos page (Task 3)', async ({
    userPage,
  }) => {
    await userPage.goto('/videos');

    // E2E Video Alpha has publishedAt = 2026-01-10 (past) and is the newest-first
    // card on page 1.
    await expect(
      userPage.getByRole('heading', { level: 2, name: 'E2E Video Alpha' })
    ).toBeVisible();
  });
});
