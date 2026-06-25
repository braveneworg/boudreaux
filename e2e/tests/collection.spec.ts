/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { expect, test } from '../fixtures/base.fixture';

/**
 * Coverage for the authenticated `/collection` page. The seeded regular user
 * (`testuser`) has one purchase — E2E Album One — so the page renders exactly
 * one collection row with a download dialog and no admin-only delete control.
 * Admin-gated deletion is exercised separately in admin-entity-delete.spec.ts.
 */

test.describe('My Collection — auth gate', () => {
  test('redirects an unauthenticated visitor to sign in', async ({ page }) => {
    await page.goto('/collection');
    await page.waitForURL(/\/signin/, { timeout: 10_000 });
  });
});

test.describe('My Collection — purchased user', () => {
  test('lists the purchased release with its artist', async ({ userPage }) => {
    await userPage.goto('/collection');

    // The per-row download trigger carries an unambiguous aria-label, so it is
    // the most reliable signal that the purchased row has hydrated.
    // The per-row download trigger (unambiguous aria-label) and the artist name
    // together prove the purchased row rendered. "My Collection" itself is
    // avoided as an assertion target: it appears in both the header nav and a
    // responsive (mobile + desktop) breadcrumb, so it is intrinsically ambiguous.
    await expect(userPage.getByRole('button', { name: 'Download E2E Album One' })).toBeVisible({
      timeout: 10_000,
    });
    // The row's artist name can momentarily appear twice while the page hydrates
    // (server HTML + client render both briefly in the DOM), so wait for the
    // count to settle to one before asserting visibility.
    const artistName = userPage.getByText('E2E Artist');
    await expect(artistName).toHaveCount(1);
    await expect(artistName).toBeVisible();
  });

  test('opens the per-release download dialog with format options', async ({ userPage }) => {
    await userPage.goto('/collection');

    const trigger = userPage.getByRole('button', { name: 'Download E2E Album One' });
    await expect(trigger).toBeVisible({ timeout: 10_000 });
    await trigger.click();

    // Dialog title is "Download"; Album One seeds 4 downloadable formats
    // (MP3 320kbps, AAC, FLAC, WAV), all selected by default.
    await expect(userPage.getByRole('heading', { name: 'Download', exact: true })).toBeVisible({
      timeout: 5_000,
    });
    await expect(userPage.getByRole('button', { name: /Download \d+ formats?/ })).toBeVisible();
  });

  test('does not expose a delete-purchase control to a non-admin user', async ({ userPage }) => {
    await userPage.goto('/collection');

    // Ensure the row has rendered before asserting the absence of the control.
    await expect(userPage.getByRole('button', { name: 'Download E2E Album One' })).toBeVisible({
      timeout: 10_000,
    });
    await expect(userPage.getByRole('button', { name: /Delete purchase for/ })).toHaveCount(0);
  });
});
