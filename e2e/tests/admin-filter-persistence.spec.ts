/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { expect, test } from '../fixtures/auth.fixture';

/**
 * The admin data-view filter store persists search/toggles/sort to
 * sessionStorage (key `boudreaux-admin-filters`), so filters survive
 * edit-and-back navigation and tab reloads within a browser session.
 */
test.describe('Admin data-view filter persistence', () => {
  test('release filters survive navigating away and back, and a reload', async ({ adminPage }) => {
    await adminPage.goto('/admin/releases');
    // "Album Two" matches only the published seed "E2E Album Two", so the
    // row set stays assertable with the unpublished toggle off below.
    await adminPage.getByPlaceholder(/search releases/i).fill('Album Two');
    // Releases use forceHardDelete → no "Show deleted" toggle exists; the
    // "Show unpublished" toggle (default ON) is the persistence probe.
    await adminPage.getByRole('switch', { name: /show unpublished/i }).click();

    await adminPage.goto('/admin');
    await adminPage.goto('/admin/releases');
    await expect(adminPage.getByPlaceholder(/search releases/i)).toHaveValue('Album Two');
    await expect(adminPage.getByRole('switch', { name: /show unpublished/i })).not.toBeChecked();

    await adminPage.reload();
    await expect(adminPage.getByPlaceholder(/search releases/i)).toHaveValue('Album Two');
    await expect(adminPage.getByRole('switch', { name: /show unpublished/i })).not.toBeChecked();
    // The rows reflect the persisted filters, not just the controls: only
    // the matching published release renders.
    await expect(adminPage.getByText('E2E Album Two')).toBeVisible();
    await expect(adminPage.getByText('E2E Album One')).not.toBeVisible();
  });

  test('video sort selection survives navigation', async ({ adminPage }) => {
    await adminPage.goto('/admin/videos');
    await adminPage.getByRole('radio', { name: 'Oldest first' }).click();

    await adminPage.goto('/admin');
    await adminPage.goto('/admin/videos');
    await expect(adminPage.getByRole('radio', { name: 'Oldest first' })).toBeChecked();
  });
});
