/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { expect, test } from '../fixtures/auth.fixture';
import {
  createEditableFeaturedArtist,
  deleteFeaturedArtist,
  readFeaturedArtistText,
} from '../helpers/e2e-db';

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

test.describe('Admin featured artist edit save', () => {
  // Saving the edit page used to keep a field the admin emptied: the update
  // hook dropped blanks and the action mapped them to `undefined`.
  test('clears the display name and description the admin empties', async ({ adminPage }) => {
    const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const id = await createEditableFeaturedArtist({
      displayName: `E2E Clearable ${stamp}`,
      description: `Clearable blurb ${stamp}`,
    });

    try {
      await adminPage.goto(`/admin/featured-artists/${id}`);

      const displayName = adminPage.locator('[name="displayName"]');
      await expect(displayName).toHaveValue(`E2E Clearable ${stamp}`, { timeout: 15_000 });
      // The track picker renders once the release's MP3 format has loaded and
      // been written back to the form, which a save needs.
      await expect(adminPage.getByText('Featured Track (Optional)')).toBeVisible({
        timeout: 15_000,
      });

      await displayName.fill('');
      await adminPage.getByRole('textbox', { name: 'Description (Optional)' }).fill('');
      await adminPage.getByRole('button', { name: 'Save Changes', exact: true }).click();

      await expect(adminPage).toHaveURL(/\/admin\?entity=featuredArtist$/, { timeout: 15_000 });
      expect(await readFeaturedArtistText(id)).toEqual({ displayName: null, description: null });
    } finally {
      await deleteFeaturedArtist(id);
    }
  });
});
