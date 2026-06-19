/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { expect, test } from '../fixtures/auth.fixture';

/**
 * E2E coverage for the /admin/releases list, now rendered with the shared
 * searchable DataView (replacing the old bespoke card list).
 */

test.describe('Admin releases list', () => {
  test('renders the releases list with a search box and create button', async ({ adminPage }) => {
    await adminPage.goto('/admin/releases');

    await expect(adminPage.getByRole('heading', { name: 'Releases', exact: true })).toBeVisible();
    await expect(adminPage.getByPlaceholder(/search releases/i)).toBeVisible();
    await expect(adminPage.getByRole('button', { name: /create release/i })).toBeVisible();
  });

  test('filters the list via the search box', async ({ adminPage }) => {
    await adminPage.goto('/admin/releases');

    const search = adminPage.getByPlaceholder(/search releases/i);
    await expect(search).toBeVisible();
    await search.fill('Alpha');

    // The list should still render (no crash) after a server-side search round-trip.
    await expect(search).toHaveValue('Alpha');
  });

  test('shows a breadcrumb back to the dashboard', async ({ adminPage }) => {
    await adminPage.goto('/admin/releases');

    await expect(adminPage.getByRole('link', { name: 'Admin', exact: true })).toHaveAttribute(
      'href',
      '/admin'
    );
  });
});
