/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { test, expect } from '../fixtures/base.fixture';

/**
 * Root zine 404 (`src/app/not-found.tsx`): any unmatched route must respond
 * with a real 404 status (not soft-render a 200) and render the NOT-FOUND
 * cutout heading inside the root layout, with a "Back home" escape hatch.
 * No viewport pinning — the 404 panel is viewport-agnostic.
 */
test.describe('Root 404 page', () => {
  test('bogus URL renders the zine 404', async ({ page }) => {
    // Playwright does not throw on 404 responses; the status guards the
    // route actually 404ing rather than soft-rendering.
    const response = await page.goto('/this-page-does-not-exist');
    expect(response?.status()).toBe(404);

    await expect(page.getByRole('img', { name: 'page not found' })).toBeVisible({
      timeout: 10_000,
    });
    await expect(page.getByRole('link', { name: 'Back home' })).toHaveAttribute('href', '/');
  });

  test('404 page navigates home', async ({ page }) => {
    await page.goto('/this-page-does-not-exist');

    const backHome = page.getByRole('link', { name: 'Back home' });
    await expect(backHome).toBeVisible({ timeout: 10_000 });
    await backHome.click();

    // Back on the home page: the FEATURED cutout heading renders.
    await expect(page).toHaveURL('/');
    await expect(page.getByRole('img', { name: 'featured artists' })).toBeVisible({
      timeout: 10_000,
    });
  });
});
