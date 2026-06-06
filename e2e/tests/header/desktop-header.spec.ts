/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { test, expect } from '../../fixtures/base.fixture';

/**
 * Desktop header coverage. The default Playwright project uses Desktop Chrome,
 * whose User-Agent makes the server render the desktop branch of the header
 * (the primary `DesktopMenu` nav plus the `DesktopAuthMenu`). The mobile
 * hamburger auth flow is covered separately in auth/signout.spec.ts.
 */
test.describe('Desktop header — primary navigation', () => {
  test('shows the Playlists nav link', async ({ page }) => {
    await page.goto('/');

    await expect(page.getByRole('banner').getByRole('link', { name: 'Playlists' })).toBeVisible({
      timeout: 10_000,
    });
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

  test('signs out from the desktop auth menu', async ({ userPage }) => {
    await userPage.goto('/');

    const authMenu = userPage.getByRole('navigation', { name: 'Authentication' });
    const signOut = authMenu.getByRole('button', { name: 'sign out' });
    await expect(signOut).toBeVisible({ timeout: 10_000 });

    await signOut.click();

    // After signing out the menu flips back to the signed-out links.
    await expect(authMenu.getByRole('link', { name: 'sign in' })).toBeVisible({ timeout: 10_000 });
  });
});
