/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { expect, test } from '../fixtures/auth.fixture';

/**
 * Admin → public propagation: a banner notification saved through the admin
 * editor (which now goes through the `useUpsertBannerNotificationMutation` hook
 * and the server action's `revalidatePath('/')` + cache invalidation) must show
 * up on a clean load of the public home page.
 *
 * The desktop notification ticker (default 1280px viewport) rotates through the
 * active banners one at a time on an interval (the seed pins it to 3s), so after
 * a single home-page load the retrying locator catches the freshly saved text
 * once the ticker cycles onto that slot.
 */
test.describe('Admin banner edit reflects on the public home page', () => {
  test('a saved banner notification appears in the home banner strip', async ({ adminPage }) => {
    const uniqueText = `E2E immediate update ${Date.now()}`;

    await adminPage.goto('/admin/notifications');

    const content = adminPage.locator('#content-2');
    await expect(content).toBeVisible();
    await content.fill(uniqueText);

    // Scope to slot 2's own form so we click its Save button (each slot and the
    // rotation-interval control render their own Save button).
    const slotForm = adminPage.locator('form').filter({ has: adminPage.locator('#content-2') });
    await slotForm.getByRole('button', { name: /save/i }).click();

    await expect(adminPage.getByText('Saved successfully.')).toBeVisible({ timeout: 15_000 });

    // Load the public home page once; the desktop ticker rotates through the
    // active banners, so the retrying locator catches the new text when the
    // ticker cycles onto slot 2 (a couple of rotation intervals at most).
    await adminPage.goto('/');
    await expect(
      adminPage.locator('.banner-strip-slide', { hasText: uniqueText }).first()
    ).toBeVisible({ timeout: 20_000 });
  });
});
