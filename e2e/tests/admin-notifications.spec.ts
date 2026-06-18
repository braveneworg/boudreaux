/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { expect, test } from '../fixtures/auth.fixture';

/**
 * E2E coverage for the /admin/notifications banner management page: section
 * header, rotation interval control, and the per-slot editors.
 */

test.describe('Admin notifications', () => {
  test('renders the banner notifications section header', async ({ adminPage }) => {
    await adminPage.goto('/admin/notifications');

    await expect(
      adminPage.getByRole('heading', { name: 'Banner Notifications', exact: true })
    ).toBeVisible();
  });

  test('renders the rotation interval control', async ({ adminPage }) => {
    await adminPage.goto('/admin/notifications');

    await expect(adminPage.getByRole('heading', { name: /rotation interval/i })).toBeVisible();
    await expect(adminPage.locator('#rotation-interval')).toBeVisible();
  });

  test('renders the per-slot editors', async ({ adminPage }) => {
    await adminPage.goto('/admin/notifications');

    await expect(adminPage.getByRole('heading', { name: 'Slot 1' })).toBeVisible();
  });
});
