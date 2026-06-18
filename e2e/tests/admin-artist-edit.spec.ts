/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { expect, test } from '../fixtures/auth.fixture';

/**
 * E2E coverage for the /admin/artists/[artistId] edit view, reached from the
 * artists list. Artists remain editable even though they can no longer be
 * created from this section.
 */

test.describe('Admin artist edit', () => {
  test('opens the edit form for a seeded artist from the list', async ({ adminPage }) => {
    await adminPage.goto('/admin/artists');

    const editLink = adminPage.getByRole('link', { name: /edit/i }).first();
    await expect(editLink).toBeVisible({ timeout: 15_000 });
    await editLink.click();

    await expect(adminPage).toHaveURL(/\/admin\/artists\/[a-f0-9]{24}$/);
    await expect(adminPage.getByRole('heading', { name: 'Edit Artist', exact: true })).toBeVisible({
      timeout: 15_000,
    });
  });

  test('renders the editable name fields and a save action', async ({ adminPage }) => {
    await adminPage.goto('/admin/artists');

    const editLink = adminPage.getByRole('link', { name: /edit/i }).first();
    await expect(editLink).toBeVisible({ timeout: 15_000 });
    await editLink.click();

    await expect(adminPage.locator('[name="slug"]')).toBeVisible({ timeout: 15_000 });
    await expect(adminPage.getByRole('button', { name: 'Save', exact: true })).toBeVisible();
  });
});
