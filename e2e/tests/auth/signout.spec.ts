import { devices } from '@playwright/test';

import { test, expect } from '../../fixtures/base.fixture';

// Auth controls (Sign Out, Admin link) are only rendered inside the
// mobile HamburgerMenu.  Desktop Chrome shows no auth toolbar.
test.use({ ...devices['Pixel 5'] });

test.describe('Signout Flow', () => {
  test('should sign out successfully when clicking sign out button', async ({ userPage }) => {
    await userPage.goto('/');

    // Open the hamburger menu to access auth controls
    await userPage.getByRole('button', { name: /open menu/i }).click();

    // The signed-in toolbar shows a "Sign Out" button inside the sheet
    const signOutButton = userPage.getByRole('button', { name: /sign out/i });
    await expect(signOutButton).toBeVisible({ timeout: 10_000 });

    await signOutButton.click();

    // After signout, should redirect and show sign in/up links in the hamburger menu
    await userPage.getByRole('button', { name: /open menu/i }).click();
    await expect(userPage.getByRole('link', { name: /sign in/i })).toBeVisible({ timeout: 10_000 });
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
