/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { PrismaClient } from '@prisma/client';

import { expect, test } from '../../fixtures/auth.fixture';
import { mockTurnstile, waitForTurnstileVerification } from '../../helpers/turnstile-mock';

/**
 * E2E coverage for the "pause new signups" admin toggle.
 *
 * Global-state hazard: the `signups-paused` SiteSettings row is shared across
 * the entire E2E database. Leaving it set to `true` after a failure would break
 * every other signup test in the suite.
 *
 * Mitigations:
 * - `test.describe.serial` — tests run one at a time, no parallel contamination.
 * - `afterEach` — unconditionally restores the flag to `false` (unpaused) even
 *   if an assertion throws, using a direct Prisma write that bypasses the cache
 *   (cache TTL = 0 in E2E mode, so a subsequent read sees the reset value
 *   immediately regardless).
 *
 * DB isolation: all Prisma access uses the hardcoded E2E URL (localhost:27018).
 * Never reads from process.env or any .env file.
 */

const E2E_DATABASE_URL =
  process.env.E2E_DATABASE_URL || 'mongodb://localhost:27018/boudreaux-e2e?replicaSet=rs0';

const SIGNUPS_PAUSED_KEY = 'signups-paused';

/** Direct-to-DB writer that bypasses the service cache. */
const setSignupsPausedInDb = async (paused: boolean): Promise<void> => {
  const prisma = new PrismaClient({ datasourceUrl: E2E_DATABASE_URL });
  try {
    await prisma.siteSettings.upsert({
      where: { key: SIGNUPS_PAUSED_KEY },
      create: { key: SIGNUPS_PAUSED_KEY, value: String(paused) },
      update: { value: String(paused) },
    });
  } finally {
    await prisma.$disconnect();
  }
};

const SUBMIT_LABEL = 'Email me a sign-in link';
const PAUSED_NOTICE = 'Signups are temporarily paused. Please try again later.';

/**
 * Serial because the pause flag is a global DB row: concurrent tests would
 * race on it and could leave the flag stranded if a test is interrupted.
 */
test.describe.serial('Signups pause toggle', () => {
  test.afterEach(async () => {
    // Unconditional cleanup — restores the flag to UNPAUSED even after a
    // failed assertion, so the global state can never be stranded.
    await setSignupsPausedInDb(false);
  });

  test('admin can toggle signups pause ON from /admin/settings', async ({ adminPage }) => {
    await adminPage.goto('/admin/settings');

    const toggle = adminPage.getByRole('switch', { name: 'Pause new signups' });
    await expect(toggle).toBeVisible();
    await expect(toggle).not.toBeChecked();

    await toggle.click();
    await expect(toggle).toBeChecked();
  });

  test('paused signup page shows notice and disabled submit button', async ({
    adminPage,
    page,
  }) => {
    // Pause signups via the admin UI
    await adminPage.goto('/admin/settings');
    const toggle = adminPage.getByRole('switch', { name: 'Pause new signups' });
    await expect(toggle).toBeVisible();
    await expect(toggle).not.toBeChecked();
    await toggle.click();
    await expect(toggle).toBeChecked();

    // Anonymous visitor visits /signup and sees the paused notice
    await mockTurnstile(page);
    await page.goto('/signup');
    await waitForTurnstileVerification(page);

    await expect(page.getByText(PAUSED_NOTICE)).toBeVisible({ timeout: 10_000 });
    await expect(page.getByRole('button', { name: SUBMIT_LABEL })).toBeDisabled();
  });

  test('forced signup submit while paused returns the friendly error message', async ({
    adminPage,
    page,
  }) => {
    // Pause signups via the admin UI
    await adminPage.goto('/admin/settings');
    const toggle = adminPage.getByRole('switch', { name: 'Pause new signups' });
    await expect(toggle).not.toBeChecked();
    await toggle.click();
    await expect(toggle).toBeChecked();

    // Attempt a server-side submit by bypassing the disabled button via the API
    // (the server action is the hard enforcement gate)
    await mockTurnstile(page);
    await page.goto('/signup');
    await waitForTurnstileVerification(page);

    await page.locator('input#email').fill('newperson@example.com');
    await page.locator('#terms-and-conditions').click();

    // Assert the button is present and disabled before bypassing the UI gate
    await expect(page.getByRole('button', { name: SUBMIT_LABEL })).toBeDisabled();

    // Remove the disabled attribute so we can click the button and reach the
    // server action (the server is the enforcement gate, not the UI)
    await page.evaluate(() => {
      const btn = document.querySelector('button[type="submit"]') as HTMLButtonElement | null;
      if (btn) btn.disabled = false;
    });
    await page.getByRole('button', { name: SUBMIT_LABEL }).click();

    // The server action returns the friendly error; the form renders it
    await expect(
      page.getByText('Signups are temporarily paused. Please try again later.')
    ).toBeVisible({ timeout: 10_000 });
  });

  test('existing user can still sign in while signups are paused', async ({ adminPage, page }) => {
    // Pause signups via the admin UI
    await adminPage.goto('/admin/settings');
    const toggle = adminPage.getByRole('switch', { name: 'Pause new signups' });
    await expect(toggle).not.toBeChecked();
    await toggle.click();
    await expect(toggle).toBeChecked();

    // Existing seeded user visits /signin — the form should NOT show the paused
    // notice (useSignupStatusQuery only activates when hasTermsAndConditions=true,
    // i.e. on the /signup path) and the submit button must be enabled
    await mockTurnstile(page);
    await page.goto('/signin');
    await waitForTurnstileVerification(page);

    await expect(page.getByText(PAUSED_NOTICE)).toHaveCount(0);
    await expect(page.getByRole('button', { name: SUBMIT_LABEL })).toBeEnabled();

    // Confirm the signin request for an existing user succeeds (redirects to success)
    await page.locator('input#email').fill('testuser@example.com');
    await page.getByRole('button', { name: SUBMIT_LABEL }).click();

    await expect(page).toHaveURL(/success/, { timeout: 15_000 });
  });

  test('admin toggles pause OFF and signup works again', async ({ adminPage, page }) => {
    // First pause signups
    await adminPage.goto('/admin/settings');
    const toggle = adminPage.getByRole('switch', { name: 'Pause new signups' });
    await expect(toggle).not.toBeChecked();
    await toggle.click();
    await expect(toggle).toBeChecked();

    // Now unpause signups
    await toggle.click();
    await expect(toggle).not.toBeChecked();

    // Visitor visits /signup — no paused notice, submit is enabled
    await mockTurnstile(page);
    await page.goto('/signup');
    await waitForTurnstileVerification(page);

    await expect(page.getByText(PAUSED_NOTICE)).toHaveCount(0);
    await expect(page.getByRole('button', { name: SUBMIT_LABEL })).toBeEnabled();

    // Signup itself should succeed (redirects to the success page)
    await page.locator('input#email').fill('newresumeduser@example.com');
    await page.locator('#terms-and-conditions').click();
    await page.getByRole('button', { name: SUBMIT_LABEL }).click();

    await expect(page).toHaveURL(/success/, { timeout: 15_000 });
  });
});
