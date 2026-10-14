/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { test, expect } from '../../fixtures/base.fixture';

/**
 * Desktop header coverage. The header is viewport-responsive (CSS), not
 * User-Agent gated: the desktop chrome (`DesktopMenu` nav + `DesktopAuthMenu`)
 * shows at the `xl` breakpoint (min-width: 1280px) via `xl:contents`.
 *
 * Pin a viewport clearly above `xl`; the default Desktop Chrome 1280×720 sits
 * exactly on the breakpoint. The `test.use` viewport also propagates to the
 * `userPage` / `adminPage` fixtures.
 *
 * The mobile hamburger auth flow is covered separately in auth/signout.spec.ts.
 */
test.use({ viewport: { width: 1440, height: 900 } });

test.describe('Desktop header — primary navigation', () => {
  test('shows the Playlists nav link inside the Music drawer', async ({ page }) => {
    await page.goto('/');

    // Drawered links only render once their drawer opens — click the Music
    // trigger first (10s allowance covers the nav's client mount).
    const musicTrigger = page.getByRole('banner').getByRole('button', { name: 'Music' });
    await expect(musicTrigger).toBeVisible({ timeout: 10_000 });
    await musicTrigger.click();

    await expect(page.getByRole('banner').getByRole('link', { name: 'Playlists' })).toBeVisible();
  });

  test('keeps the Music drawer open while the pointer crosses the gap to Artists', async ({
    page,
  }) => {
    // On /releases the drawer's Artists row overlaps the page's search button.
    // Radix closes a hover-opened drawer 150ms after the pointer leaves both the
    // trigger and the drawer, so a pointer that pauses in the strip between
    // them used to lose the drawer and press the search button instead.
    await page.goto('/releases');

    const banner = page.getByRole('banner');
    const musicTrigger = banner.getByRole('button', { name: 'Music' });
    await expect(musicTrigger).toBeVisible({ timeout: 10_000 });
    const releasesSearch = page.getByRole('button', { name: 'Search releases' });
    await expect(releasesSearch).toBeVisible({ timeout: 10_000 });

    // Hover opens the drawer (Radix's delayed open fires on pointer move).
    await musicTrigger.hover();
    const artists = banner.getByRole('link', { name: 'Artists' });
    await expect(artists).toBeVisible();

    // Both boxes from one frame, then park the pointer midway in the strip
    // between the trigger's bottom edge and the drawer's top edge.
    const strip = await page.evaluate(() => {
      const trigger = document.querySelector('[data-slot="navigation-menu-trigger"]');
      const drawer = document.querySelector('[data-slot="navigation-menu-content"]');
      if (!trigger || !drawer) throw new Error('nav drawer not rendered');
      const t = trigger.getBoundingClientRect();
      const d = drawer.getBoundingClientRect();
      return { x: t.left + t.width / 2, y: (t.bottom + d.top) / 2, gap: d.top - t.bottom };
    });
    expect(strip.gap).toBeGreaterThan(0);
    await page.mouse.move(strip.x, strip.y, { steps: 6 });

    // Well past Radix's 150ms close timer: the drawer must still be open.
    await page.waitForTimeout(400);
    await expect(musicTrigger).toHaveAttribute('aria-expanded', 'true');
    await expect(artists).toBeVisible();

    await artists.click();

    await expect(page).toHaveURL(/\/artists$/);
    await expect(page.locator('[data-slot="popover-content"]')).toHaveCount(0);
  });

  test('links Merch in the Label drawer to the shirt store in a new tab', async ({ page }) => {
    await page.goto('/');

    const labelTrigger = page.getByRole('banner').getByRole('button', { name: 'Label' });
    await expect(labelTrigger).toBeVisible({ timeout: 10_000 });
    await labelTrigger.click();

    // Attributes only — the spec never leaves the site for the store.
    const merch = page.getByRole('banner').getByRole('link', { name: 'Merch' });
    await expect(merch).toHaveAttribute('href', 'https://fakefourshirts.com/');
    await expect(merch).toHaveAttribute('target', '_blank');
    await expect(merch).toHaveAttribute('rel', 'noopener noreferrer');
  });

  test('hides the My Collection link when signed out', async ({ page }) => {
    await page.goto('/');

    // Wait for the auth menu to resolve so the nav has finished rendering.
    await expect(
      page
        .getByRole('navigation', { name: 'Authentication' })
        .getByRole('link', { name: 'sign in' })
    ).toBeVisible({ timeout: 10_000 });

    await expect(page.getByRole('banner').getByRole('link', { name: 'My Collection' })).toHaveCount(
      0
    );
  });

  test('shows the My Collection link when signed in', async ({ userPage }) => {
    await userPage.goto('/');

    await expect(
      userPage.getByRole('banner').getByRole('link', { name: 'My Collection' })
    ).toBeVisible({ timeout: 10_000 });
  });
});

test.describe('Desktop header — auth menu', () => {
  test('shows sign in and sign up links when signed out', async ({ page }) => {
    await page.goto('/');

    const authMenu = page.getByRole('navigation', { name: 'Authentication' });
    await expect(authMenu.getByRole('link', { name: 'sign in' })).toHaveAttribute(
      'href',
      '/signin'
    );
    await expect(authMenu.getByRole('link', { name: 'sign up' })).toHaveAttribute(
      'href',
      '/signup'
    );
  });

  test('shows the username, sign out, and no admin link for a regular user', async ({
    userPage,
  }) => {
    await userPage.goto('/');

    const authMenu = userPage.getByRole('navigation', { name: 'Authentication' });
    await expect(authMenu.getByRole('link', { name: '@testuser' })).toHaveAttribute(
      'href',
      '/profile'
    );
    await expect(authMenu.getByRole('button', { name: 'sign out' })).toBeVisible();
    // exact match so the "@adminuser"-style substring can't match; a regular
    // user must never see the admin link.
    await expect(authMenu.getByRole('link', { name: 'admin', exact: true })).toHaveCount(0);
  });

  test('shows the admin link for an admin user', async ({ adminPage }) => {
    await adminPage.goto('/');

    const authMenu = adminPage.getByRole('navigation', { name: 'Authentication' });
    // exact match to avoid matching the "@adminuser" profile link.
    await expect(authMenu.getByRole('link', { name: 'admin', exact: true })).toHaveAttribute(
      'href',
      '/admin'
    );
  });

  // Uses the dedicated disposable sign-out session (NOT the shared regular
  // session): better-auth deletes the session row on sign-out, so this must own
  // a session no other spec depends on.
  test('signs out from the desktop auth menu', async ({ signOutPage }) => {
    await signOutPage.goto('/');

    const authMenu = signOutPage.getByRole('navigation', { name: 'Authentication' });
    const signOut = authMenu.getByRole('button', { name: 'sign out' });
    await expect(signOut).toBeVisible({ timeout: 10_000 });

    await signOut.click();

    // After signing out the menu flips back to the signed-out links.
    await expect(authMenu.getByRole('link', { name: 'sign in' })).toBeVisible({ timeout: 10_000 });
  });
});
