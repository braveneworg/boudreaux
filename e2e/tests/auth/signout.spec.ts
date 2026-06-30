/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { devices } from '@playwright/test';

import { test, expect } from '../../fixtures/base.fixture';

// Auth controls (Sign Out, Admin link) are only rendered inside the
// mobile HamburgerMenu.  Desktop Chrome shows no auth toolbar.
test.use({ ...devices['Pixel 5'] });

test.describe('Signout Flow', () => {
  // Uses the dedicated disposable sign-out session (NOT the shared regular
  // session): better-auth deletes the session row on sign-out, so this must own
  // a session no other spec depends on.
  test('should sign out successfully when clicking sign out button', async ({ signOutPage }) => {
    await signOutPage.goto('/');

    // Open the hamburger menu to access auth controls
    await signOutPage.getByRole('button', { name: /open menu/i }).click();

    // The signed-in toolbar shows a "Sign Out" button inside the sheet
    const signOutButton = signOutPage.getByRole('button', { name: /sign out/i });
    await expect(signOutButton).toBeVisible({ timeout: 10_000 });

    await signOutButton.click();

    // Wait for the Sign Out button to disappear, signalling the signOut()
    // promise has resolved and the session is no longer authenticated.
    // Otherwise the next menu-open race-conditions with the router.push()
    // that fires after signOut() resolves.
    await expect(signOutButton).toBeHidden({ timeout: 10_000 });

    // After signout, the router.push() re-render can land AFTER the next
    // menu click, silently closing the freshly-opened sheet (the click is
    // not retried by the assertion below it). Retry the whole open+assert
    // compound so a sheet lost to the remount just gets reopened.
    await expect(async () => {
      // Close any half-open sheet from a previous attempt before clicking.
      await signOutPage.keyboard.press('Escape');
      await signOutPage.getByRole('button', { name: /open menu/i }).click({ timeout: 2_000 });
      await expect(signOutPage.getByRole('link', { name: /sign in/i })).toBeVisible({
        timeout: 2_000,
      });
    }).toPass({ timeout: 15_000 });
  });

  test('should show authenticated toolbar for logged in user', async ({ userPage }) => {
    await userPage.goto('/');

    // Open hamburger menu
    await userPage.getByRole('button', { name: /open menu/i }).click();

    // Verify the signed-in toolbar is showing (Sign Out button visible)
    await expect(userPage.getByRole('button', { name: /sign out/i })).toBeVisible({
      timeout: 10_000,
    });
  });

  test('should show admin link for admin user', async ({ adminPage }) => {
    await adminPage.goto('/');

    // Open hamburger menu
    await adminPage.getByRole('button', { name: /open menu/i }).click();

    // Admin should see the Admin link in the toolbar
    // Use exact match to avoid matching the "@adminuser" profile link
    await expect(adminPage.getByRole('link', { name: 'Admin', exact: true })).toBeVisible({
      timeout: 10_000,
    });
  });
});

// The signout success page (/success/signout) is a static public page. It is
// not auto-navigated to by the Sign Out button (that pushes "/"), but it is
// linked from emails / direct navigation, so cover its redesigned copy + CTAs.
// It is fully responsive; the file-level Pixel 5 viewport is fine here.
test.describe('Signout success page', () => {
  test('renders the signed-out confirmation heading', async ({ page }) => {
    await page.goto('/success/signout');
    await expect(page.getByRole('heading', { name: "You're signed out." })).toBeVisible();
  });

  test('explains the session ended', async ({ page }) => {
    await page.goto('/success/signout');
    await expect(page.getByText('You have been successfully signed out.')).toBeVisible();
  });

  test('offers a sign-back-in CTA pointing at /signin', async ({ page }) => {
    await page.goto('/success/signout');
    await expect(page.getByRole('link', { name: 'Sign back in' })).toHaveAttribute(
      'href',
      '/signin'
    );
  });

  test('offers a homepage link', async ({ page }) => {
    await page.goto('/success/signout');
    await expect(page.getByRole('link', { name: 'Go to homepage' })).toHaveAttribute('href', '/');
  });
});
