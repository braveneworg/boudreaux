import { test, expect } from '@playwright/test';

import { mockTurnstile, waitForTurnstileVerification } from '../../helpers/turnstile-mock';

test.describe('Signin Flow', () => {
  test.beforeEach(async ({ page }) => {
    await mockTurnstile(page);
  });

  test('should display the signin form without terms toggle', async ({ page }) => {
    await page.goto('/signin');
    await waitForTurnstileVerification(page);

    await expect(page.getByRole('heading', { name: 'Sign In' })).toBeVisible();
    await expect(page.locator('input[id="email"]')).toBeVisible();
    // Terms and conditions should not be visible on signin
    await expect(page.locator('#terms-and-conditions')).not.toBeVisible();
    await expect(page.getByRole('button', { name: 'Submit' })).toBeVisible();
  });

  test('should show validation error for invalid email', async ({ page }) => {
    await page.goto('/signin');
    await waitForTurnstileVerification(page);

    await page.locator('input[id="email"]').fill('not-an-email');
    await page.getByRole('button', { name: 'Submit' }).click();

    // Expect email validation error
    await expect(page.locator('[data-slot="form-message"]').first()).toBeVisible();
  });

  test('should show validation error for empty email', async ({ page }) => {
    await page.goto('/signin');
    await waitForTurnstileVerification(page);

    await page.getByRole('button', { name: 'Submit' }).click();

    // Expect validation error
    await expect(page.locator('[data-slot="form-message"]').first()).toBeVisible();
  });

  test('should submit signin form with valid email', async ({ page }) => {
    await page.goto('/signin');
    await waitForTurnstileVerification(page);

    await page.locator('input[id="email"]').fill('testuser@example.com');
    await page.getByRole('button', { name: 'Submit' }).click();

    // Should navigate to success/verify page
    await expect(page).toHaveURL(/success/, { timeout: 15_000 });
  });
});
