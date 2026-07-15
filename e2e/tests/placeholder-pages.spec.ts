/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { test, expect } from '../fixtures/base.fixture';
import { openDesktopNavLink } from '../helpers/desktop-nav';

/**
 * Placeholder pages (Merch): header-nav wiring plus the zine panel the page
 * renders. Desktop-only nav coverage is enough — the mobile menu shares
 * `useNavMenuItems`, so the desktop click (via the owning Music/Label drawer)
 * proves the link wiring, and the page itself is viewport-agnostic.
 * (Playlists is no longer a placeholder — its signed-in flows live in
 * `e2e/tests/playlists/`, including the signed-out `/signin` redirect.)
 *
 * The desktop nav shows at the `xl` breakpoint (min-width: 1280px) via CSS;
 * pin a viewport clearly above `xl` — the default Desktop Chrome 1280×720
 * sits exactly on the breakpoint.
 */
test.use({ viewport: { width: 1440, height: 900 } });

test.describe('Placeholder pages', () => {
  test('header nav reaches the Merch placeholder', async ({ page }) => {
    await page.goto('/');

    await openDesktopNavLink(page, 'Merch');

    await expect(page).toHaveURL('/merch');
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Merch');

    const browseReleases = page.getByRole('link', { name: 'Browse Releases' });
    await expect(browseReleases).toBeVisible();
    await expect(browseReleases).toHaveAttribute('href', '/releases');
  });
});
