import { test, expect } from '@playwright/test';

import { mockTurnstile, waitForTurnstileVerification } from '../../helpers/turnstile-mock';

test.describe('Signup Flow', () => {
  test.beforeEach(async ({ page }) => {
    // Mock Turnstile as a fallback in case the test site key doesn't load
    await mockTurnstile(page);
  });

  test('should display the signup form with required fields', async ({ page }) => {
    await page.goto('/signup');
    await waitForTurnstileVerification(page);

    await expect(page.getByRole('heading', { name: 'Sign Up' })).toBeVisible();
    await expect(page.locator('input[id="email"]')).toBeVisible();
    await expect(page.locator('#terms-and-conditions')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Submit' })).toBeVisible();
  });

  test('should show validation error for empty email submission', async ({ page }) => {
    await page.goto('/signup');
    await waitForTurnstileVerification(page);

    // Toggle terms and conditions on
    await page.locator('#terms-and-conditions').click();

    // Submit without entering email
    await page.getByRole('button', { name: 'Submit' }).click();

    // Expect validation error message
    await expect(page.locator('[data-slot="form-message"]').first()).toBeVisible();
  });

  test('should show validation error when terms not accepted', async ({ page }) => {
    await page.goto('/signup');
    await waitForTurnstileVerification(page);

    await page.locator('input[id="email"]').fill('test@example.com');

    // Submit without accepting terms
    await page.getByRole('button', { name: 'Submit' }).click();

    // Terms validation error should appear (use specific error text to avoid
    // matching the switch label or footer link which also contain "terms")
    await expect(page.getByText('You must accept the terms and conditions')).toBeVisible();
  });

  test('should show validation error for invalid email format', async ({ page }) => {
    await page.goto('/signup');
    await waitForTurnstileVerification(page);

    await page.locator('input[id="email"]').fill('not-an-email');
    await page.locator('#terms-and-conditions').click();
    await page.getByRole('button', { name: 'Submit' }).click();

    // Expect email validation error
    await expect(page.locator('[data-slot="form-message"]').first()).toBeVisible();
  });

  test('should submit signup form with valid data', async ({ page }) => {
    await page.goto('/signup');
    await waitForTurnstileVerification(page);

    await page.locator('input[id="email"]').fill('newuser@example.com');
    await page.locator('#terms-and-conditions').click();

    await page.getByRole('button', { name: 'Submit' }).click();

    // After valid submission, should navigate to success page or show success indicator
    // The action calls redirect() on success, so we wait for navigation
    await expect(page).toHaveURL(/success/, { timeout: 15_000 });
  });
});
