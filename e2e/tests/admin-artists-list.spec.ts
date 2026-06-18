/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { expect, test } from '../fixtures/auth.fixture';

/**
 * E2E coverage for the /admin/artists list and the rule that artists can only be
 * created from a release. The list still allows editing/deleting, but exposes no
 * create entry point, and the standalone create route redirects away.
 */

test.describe('Admin artists list', () => {
  test('renders the artists list with a search box', async ({ adminPage }) => {
    await adminPage.goto('/admin/artists');

    await expect(adminPage.getByRole('heading', { name: 'Artists', exact: true })).toBeVisible();
    await expect(adminPage.getByPlaceholder(/search artists/i)).toBeVisible();
  });

  test('does not expose a create-artist button', async ({ adminPage }) => {
    await adminPage.goto('/admin/artists');

    await expect(adminPage.getByRole('button', { name: /create artist/i })).toHaveCount(0);
  });

  test('redirects the standalone create route back to the list', async ({ adminPage }) => {
    await adminPage.goto('/admin/artists/new');

    await expect(adminPage).toHaveURL(/\/admin\/artists$/);
    await expect(adminPage.getByRole('heading', { name: 'Artists', exact: true })).toBeVisible();
  });

  test('still allows editing an existing artist', async ({ adminPage }) => {
    await adminPage.goto('/admin/artists');

    const editLink = adminPage.getByRole('link', { name: /edit/i }).first();
    await expect(editLink).toBeVisible({ timeout: 15_000 });
    await expect(editLink).toHaveAttribute('href', /\/admin\/artists\//);
  });
});
