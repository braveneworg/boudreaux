/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { expect, test } from '../fixtures/auth.fixture';

/**
 * E2E coverage for the release create/edit form views, reached from the
 * releases list.
 */

test.describe('Admin release form', () => {
  test('renders the create-release view', async ({ adminPage }) => {
    await adminPage.goto('/admin/releases/new');

    await expect(adminPage.getByText('Create New Release')).toBeVisible({ timeout: 15_000 });
    await expect(adminPage.locator('[name="title"]')).toBeVisible();
  });

  test('reaches the create view from the list create button', async ({ adminPage }) => {
    await adminPage.goto('/admin/releases');

    await adminPage.getByRole('button', { name: /create release/i }).click();

    await expect(adminPage).toHaveURL(/\/admin\/releases\/new$/);
  });

  test('opens the edit view for a seeded release from the list', async ({ adminPage }) => {
    await adminPage.goto('/admin/releases');

    const editLink = adminPage.getByRole('link', { name: /edit/i }).first();
    await expect(editLink).toBeVisible({ timeout: 15_000 });
    await editLink.click();

    await expect(adminPage).toHaveURL(/\/admin\/releases\/[a-f0-9]{24}$/);
    await expect(
      adminPage.locator('[data-slot="card-title"]', { hasText: 'Edit Release' })
    ).toBeVisible({ timeout: 15_000 });
  });
});
