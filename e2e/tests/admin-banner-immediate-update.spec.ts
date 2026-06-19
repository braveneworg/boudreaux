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
 * The desktop BannerStrip (rendered at the default 1280px viewport) stitches
 * every active banner into the server-rendered HTML, so the freshly saved text
 * is present on first paint — no carousel navigation or hydration timing needed.
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

    // Re-load the public home page and assert the new banner text is in the
    // stitched desktop strip. Wrapped in toPass so a transient hydration
    // double-render can't fail the assertion mid-flight.
    await expect(async () => {
      await adminPage.goto('/');
      await expect(
        adminPage.locator('.banner-strip-slide', { hasText: uniqueText }).first()
      ).toBeVisible({ timeout: 2000 });
    }).toPass({ timeout: 20_000 });
  });
});
