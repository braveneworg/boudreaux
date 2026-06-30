/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { test, expect } from '@playwright/test';

import { mockTurnstile, waitForTurnstileVerification } from '../../helpers/turnstile-mock';

// The redesigned (better-auth) sign-in screen leads with four social provider
// buttons, then an "or continue with email" divider gating a magic-link field.
// The page heading is an ImageHeading (an <img alt="sign in">), and the submit
// CTA reads "Email me a sign-in link".
const SUBMIT_LABEL = 'Email me a sign-in link';

test.describe('Signin Flow', () => {
  test.beforeEach(async ({ page }) => {
    await mockTurnstile(page);
  });

  test('renders the sign-in heading', async ({ page }) => {
    await page.goto('/signin');
    await expect(page.getByRole('img', { name: 'sign in' })).toBeVisible();
  });

  test('offers all four social provider buttons', async ({ page }) => {
    await page.goto('/signin');

    await expect(page.getByRole('button', { name: 'Continue with Apple' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Continue with Google' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Continue with Facebook' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Continue with X (Twitter)' })).toBeVisible();
  });

  test('reveals the magic-link email field after Turnstile verifies', async ({ page }) => {
    await page.goto('/signin');
    await waitForTurnstileVerification(page);

    await expect(page.locator('input#email')).toBeVisible();
  });

  test('does not render the terms toggle on sign-in', async ({ page }) => {
    await page.goto('/signin');
    await waitForTurnstileVerification(page);

    await expect(page.locator('#terms-and-conditions')).toHaveCount(0);
  });

  test('shows the magic-link submit button', async ({ page }) => {
    await page.goto('/signin');
    await waitForTurnstileVerification(page);

    await expect(page.getByRole('button', { name: SUBMIT_LABEL })).toBeVisible();
  });

  test('shows a validation error for an invalid email', async ({ page }) => {
    await page.goto('/signin');
    await waitForTurnstileVerification(page);

    await page.locator('input#email').fill('not-an-email');
    await page.getByRole('button', { name: SUBMIT_LABEL }).click();

    await expect(page.locator('[data-slot="form-message"]').first()).toBeVisible();
  });

  test('shows a validation error for an empty email', async ({ page }) => {
    await page.goto('/signin');
    await waitForTurnstileVerification(page);

    await page.getByRole('button', { name: SUBMIT_LABEL }).click();

    await expect(page.locator('[data-slot="form-message"]').first()).toBeVisible();
  });

  test('redirects to the success page after a valid magic-link request', async ({ page }) => {
    await page.goto('/signin');
    await waitForTurnstileVerification(page);

    await page.locator('input#email').fill('testuser@example.com');
    await page.getByRole('button', { name: SUBMIT_LABEL }).click();

    await expect(page).toHaveURL(/success/, { timeout: 15_000 });
  });
});
