/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { test, expect } from '@playwright/test';

import { mockTurnstile, waitForTurnstileVerification } from '../../helpers/turnstile-mock';

// Sign-up shares the redesigned form with sign-in but additionally renders the
// terms-and-conditions switch (required before the magic link is requested).
const SUBMIT_LABEL = 'Email me a sign-in link';

test.describe('Signup Flow', () => {
  test.beforeEach(async ({ page }) => {
    // Mock Turnstile as a fallback in case the test site key doesn't load.
    await mockTurnstile(page);
  });

  test('renders the sign-up heading', async ({ page }) => {
    await page.goto('/signup');
    await expect(page.getByRole('img', { name: 'sign up' })).toBeVisible();
  });

  test('offers all four social provider buttons', async ({ page }) => {
    await page.goto('/signup');

    await expect(page.getByRole('button', { name: 'Continue with Apple' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Continue with Google' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Continue with Facebook' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Continue with X (Twitter)' })).toBeVisible();
  });

  test('renders the terms toggle on sign-up', async ({ page }) => {
    await page.goto('/signup');
    await waitForTurnstileVerification(page);

    await expect(page.locator('#terms-and-conditions')).toBeVisible();
  });

  test('shows a validation error for an empty email', async ({ page }) => {
    await page.goto('/signup');
    await waitForTurnstileVerification(page);

    await page.locator('#terms-and-conditions').click();
    await page.getByRole('button', { name: SUBMIT_LABEL }).click();

    await expect(page.locator('[data-slot="form-message"]').first()).toBeVisible();
  });

  test('shows a validation error when terms are not accepted', async ({ page }) => {
    await page.goto('/signup');
    await waitForTurnstileVerification(page);

    await page.locator('input#email').fill('test@example.com');
    await page.getByRole('button', { name: SUBMIT_LABEL }).click();

    // Use the specific message so it cannot match the switch label or footer
    // link, which also contain the word "terms".
    await expect(page.getByText('You must accept the terms and conditions')).toBeVisible();
  });

  test('shows a validation error for an invalid email format', async ({ page }) => {
    await page.goto('/signup');
    await waitForTurnstileVerification(page);

    await page.locator('input#email').fill('not-an-email');
    await page.locator('#terms-and-conditions').click();
    await page.getByRole('button', { name: SUBMIT_LABEL }).click();

    await expect(page.locator('[data-slot="form-message"]').first()).toBeVisible();
  });

  test('redirects to the success page after a valid sign-up request', async ({ page }) => {
    await page.goto('/signup');
    await waitForTurnstileVerification(page);

    await page.locator('input#email').fill('newuser@example.com');
    await page.locator('#terms-and-conditions').click();
    await page.getByRole('button', { name: SUBMIT_LABEL }).click();

    // The action calls redirect() on success, so we wait for navigation.
    await expect(page).toHaveURL(/success/, { timeout: 15_000 });
  });
});
