/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { expect, test } from '../fixtures/auth.fixture';

/**
 * E2E coverage for the /admin/featured-artists list. Previously this route
 * rendered a create form; it now renders the searchable DataView list.
 */

test.describe('Admin featured artists list', () => {
  test('renders the featured artists list with a search box', async ({ adminPage }) => {
    await adminPage.goto('/admin/featured-artists');

    await expect(
      adminPage.getByRole('heading', { name: 'Featured Artists', exact: true })
    ).toBeVisible();
    await expect(adminPage.getByPlaceholder(/search featured artists/i)).toBeVisible();
  });

  test('exposes a create entry point for featured artists', async ({ adminPage }) => {
    await adminPage.goto('/admin/featured-artists');

    await expect(adminPage.getByRole('button', { name: /create featured artist/i })).toBeVisible();
  });
});
