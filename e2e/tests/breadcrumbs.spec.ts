/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { expect, test } from '../fixtures/auth.fixture';

import type { Page } from '@playwright/test';

/**
 * A breadcrumb trail starts at Home once (#747 fixed "Home › Home" on pages
 * whose own crumbs began with Home). This was a manual smoke after #747.
 */

const homeCrumbs = (page: Page) =>
  page.getByRole('navigation', { name: 'breadcrumb' }).getByRole('link', { name: 'Home' });

test.describe('Breadcrumbs', () => {
  for (const path of ['/artists', '/artists/e2e-artist']) {
    test(`name Home once on ${path}`, async ({ page }) => {
      await page.goto(path);

      await expect(homeCrumbs(page)).toHaveCount(1, { timeout: 15_000 });
    });
  }

  test('name Home once on /playlists', async ({ userPage }) => {
    await userPage.goto('/playlists');

    await expect(homeCrumbs(userPage)).toHaveCount(1, { timeout: 15_000 });
  });
});
