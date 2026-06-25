/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { test, expect } from '@playwright/test';

// better-auth issues magic links with a 5-minute lifetime (MAGIC_LINK_EXPIRES_IN
// in src/lib/auth.ts). Tokens are single-use and stored server-side, so the
// observable expiry/invalid behaviour is the verify endpoint's handling of a
// token that is not a live record: it redirects to the callback (root) with an
// `error=INVALID_TOKEN` query param rather than minting a session. This is
// deterministic — an unknown token is indistinguishable from an expired/consumed
// one — so no wall-clock sleep is needed.
test.describe('Magic-link verification', () => {
  test('an unknown or expired token redirects with INVALID_TOKEN', async ({ page }) => {
    await page.goto('/api/auth/magic-link/verify?token=definitely-not-a-real-token&callbackURL=/');

    await expect(page).toHaveURL(/error=INVALID_TOKEN/, { timeout: 15_000 });
  });

  test('an expired token does not establish an authenticated session', async ({ page }) => {
    await page.goto('/api/auth/magic-link/verify?token=expired-token-value&callbackURL=/');
    await expect(page).toHaveURL(/error=INVALID_TOKEN/, { timeout: 15_000 });

    // The failed verification must not have set a session — /profile is gated
    // and redirects unauthenticated visitors to sign-in.
    await page.goto('/profile');
    await expect(page).toHaveURL(/signin/, { timeout: 15_000 });
  });
});
