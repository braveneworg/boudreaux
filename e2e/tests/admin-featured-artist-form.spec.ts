/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { expect, test } from '../fixtures/auth.fixture';

/**
 * E2E coverage for the /admin/featured-artists/new create view. The form's
 * full-page card wrapper was replaced with a SectionHeader; this verifies the
 * create view renders with the expected header and actions.
 */

test.describe('Admin featured artist create form', () => {
  test('renders the create-featured-artist section header', async ({ adminPage }) => {
    await adminPage.goto('/admin/featured-artists/new');

    await expect(
      adminPage.getByRole('heading', { name: 'Create Featured Artist', exact: true })
    ).toBeVisible();
  });

  test('renders cancel and submit actions', async ({ adminPage }) => {
    await adminPage.goto('/admin/featured-artists/new');

    await expect(adminPage.getByRole('button', { name: /cancel/i })).toBeVisible();
    await expect(
      adminPage.getByRole('button', { name: 'Create Featured Artist', exact: true })
    ).toBeVisible();
  });

  test('reaches the create view from the list create button', async ({ adminPage }) => {
    await adminPage.goto('/admin/featured-artists');

    await adminPage.getByRole('button', { name: /create featured artist/i }).click();

    await expect(adminPage).toHaveURL(/\/admin\/featured-artists\/new$/);
  });
});

test.describe('Admin featured artist edit form', () => {
  test('opens the edit view for the seeded featured artist from the list', async ({
    adminPage,
  }) => {
    await adminPage.goto('/admin/featured-artists');

    const editLink = adminPage.getByRole('link', { name: /edit/i }).first();
    await expect(editLink).toBeVisible({ timeout: 15_000 });
    await editLink.click();

    await expect(adminPage).toHaveURL(/\/admin\/featured-artists\/[a-f0-9]{24}$/);
    await expect(
      adminPage.getByRole('heading', { name: 'Edit Featured Artist', exact: true })
    ).toBeVisible({ timeout: 15_000 });
  });

  test('loads the seeded featured artist data into the form', async ({ adminPage }) => {
    await adminPage.goto('/admin/featured-artists');

    const editLink = adminPage.getByRole('link', { name: /edit/i }).first();
    await expect(editLink).toBeVisible({ timeout: 15_000 });
    await editLink.click();

    await expect(adminPage.locator('[name="displayName"]')).toHaveValue('E2E Featured Artist', {
      timeout: 15_000,
    });
    await expect(
      adminPage.getByRole('button', { name: 'Save Changes', exact: true })
    ).toBeVisible();
  });
});
