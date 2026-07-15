/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { expect, test } from '../fixtures/auth.fixture';

import type { Locator, Page } from '@playwright/test';

/**
 * E2E coverage for the admin videos section (`/admin/videos`, Task 11).
 *
 * Asserts against the deterministic seed (e2e/helpers/seed-test-db.ts): 7
 * PUBLISHED + 1 DRAFT + 1 ARCHIVED + 1 SCHEDULED (future-dated) video. The admin
 * list orders by `releasedOn` (desc default) and its filters are exclusive —
 * `archived` on shows ONLY archived rows; the publish switches narrow to
 * published/unpublished. Page size is 5, so the 9 non-archived rows span two
 * pages (a "Load More" footer pulls the second).
 *
 * Read-only: these specs exercise filters, sort, and dialog copy but never
 * confirm a publish/archive/delete, so the shared seed is never mutated and the
 * specs stay parallel-safe.
 */

/** Admin card titles render as level-3 headings ("Videos" section title is the h1). */
const cardTitles = (page: Page): Locator => page.getByRole('heading', { level: 3 });

/** Scope to a single admin video card by its title heading. */
const cardByTitle = (page: Page, title: string): Locator =>
  page
    .locator('[data-slot="card"]')
    .filter({ has: page.getByRole('heading', { level: 3, name: title }) });

test.describe('Admin videos — list chrome', () => {
  test('renders the search box, New Video action, and status badges', async ({ adminPage }) => {
    await adminPage.goto('/admin/videos');

    await expect(adminPage.getByRole('searchbox')).toBeVisible();

    const newVideo = adminPage.getByRole('link', { name: 'New Video' });
    await expect(newVideo).toBeVisible();
    await expect(newVideo).toHaveAttribute('href', '/admin/videos/new');

    // Both status badges are present on page 1 (the draft sorts newest by date).
    await expect(adminPage.getByText('Draft', { exact: true }).first()).toBeVisible();
    await expect(adminPage.getByText('Published', { exact: true }).first()).toBeVisible();
  });
});

test.describe('Admin videos — default view', () => {
  test('shows published and draft videos but never the archived one', async ({ adminPage }) => {
    await adminPage.goto('/admin/videos');

    // The draft sorts first by releasedOn (2026-01-08); a published video follows.
    await expect(
      adminPage.getByRole('heading', { level: 3, name: 'E2E Video Draft' })
    ).toBeVisible();
    await expect(
      adminPage.getByRole('heading', { level: 3, name: 'E2E Video Alpha' })
    ).toBeVisible();

    // Load the second page so all 9 non-archived titles are present (7 published
    // + 1 draft + 1 scheduled; the archived video is excluded from this view).
    await adminPage.getByRole('button', { name: 'Load More' }).click();
    await expect(
      adminPage.getByRole('heading', { level: 3, name: 'E2E Video Golf' })
    ).toBeVisible();
    await expect(cardTitles(adminPage)).toHaveCount(9);

    // The archived video is excluded from the default (non-archived) view.
    await expect(adminPage.getByText('E2E Video Archived')).toHaveCount(0);
  });
});

test.describe('Admin videos — filters', () => {
  test('the archived toggle shows only the archived video', async ({ adminPage }) => {
    await adminPage.goto('/admin/videos');

    await adminPage.getByRole('switch', { name: 'Show archived' }).click();

    await expect(
      adminPage.getByRole('heading', { level: 3, name: 'E2E Video Archived' })
    ).toBeVisible();
    // Non-archived rows are hidden under the exclusive archived-only view.
    await expect(adminPage.getByText('E2E Video Draft')).toHaveCount(0);
    await expect(adminPage.getByText('E2E Video Alpha')).toHaveCount(0);
  });

  test('the unpublished-only filter shows just the draft', async ({ adminPage }) => {
    await adminPage.goto('/admin/videos');

    // Turning off "Show published" leaves the unpublished (draft) rows only.
    await adminPage.getByRole('switch', { name: 'Show published' }).click();

    await expect(
      adminPage.getByRole('heading', { level: 3, name: 'E2E Video Draft' })
    ).toBeVisible();
    await expect(cardTitles(adminPage)).toHaveCount(1);
    await expect(adminPage.getByText('E2E Video Alpha')).toHaveCount(0);
  });

  test('the sort toggle flips the first published card between Alpha and Golf', async ({
    adminPage,
  }) => {
    await adminPage.goto('/admin/videos');

    // Narrow to published-only so the draft (2026-01-08) can't lead the desc view.
    await adminPage.getByRole('switch', { name: 'Show unpublished' }).click();
    await expect(cardTitles(adminPage).first()).toHaveText('E2E Video Alpha');

    await adminPage.getByRole('radio', { name: 'Oldest first' }).click();
    await expect(cardTitles(adminPage).first()).toHaveText('E2E Video Golf');
  });
});

test.describe('Admin videos — lifecycle dialogs (read-only)', () => {
  test('the delete dialog opens with its permanent-removal warning and cancels cleanly', async ({
    adminPage,
  }) => {
    await adminPage.goto('/admin/videos');

    const draftCard = cardByTitle(adminPage, 'E2E Video Draft');
    await expect(draftCard).toHaveCount(1);

    await draftCard.getByRole('button', { name: 'Delete' }).click();

    const dialog = adminPage.getByRole('dialog');
    await expect(dialog.getByRole('heading', { name: 'Confirm Delete' })).toBeVisible();
    await expect(dialog.getByText(/permanently removes the video/)).toBeVisible();

    // Cancel without confirming — never mutate the shared seed.
    await dialog.getByRole('button', { name: 'Cancel' }).click();
    await expect(dialog).toHaveCount(0);
    await expect(
      adminPage.getByRole('heading', { level: 3, name: 'E2E Video Draft' })
    ).toBeVisible();
  });
});
