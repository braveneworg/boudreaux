/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { expect, test } from '../fixtures/auth.fixture';

/**
 * E2E coverage for the /admin/tours list page (section header + new-tour entry
 * point + the seeded tour list).
 */

test.describe('Admin tours list', () => {
  test('renders the tours section header and a new-tour button', async ({ adminPage }) => {
    await adminPage.goto('/admin/tours');

    await expect(adminPage.getByRole('heading', { name: 'Tours', exact: true })).toBeVisible();
    await expect(adminPage.getByRole('link', { name: /new tour/i })).toBeVisible();
  });

  test('lists seeded tours with edit links', async ({ adminPage }) => {
    await adminPage.goto('/admin/tours');

    const tourLink = adminPage.getByRole('link', { name: /E2E .*Tour|E2E Rock Festival/ }).first();
    await expect(tourLink).toBeVisible({ timeout: 15_000 });
    await expect(tourLink).toHaveAttribute('href', /\/admin\/tours\//);
  });

  test('shows a breadcrumb back to the dashboard', async ({ adminPage }) => {
    await adminPage.goto('/admin/tours');

    await expect(adminPage.getByRole('link', { name: 'Admin', exact: true })).toHaveAttribute(
      'href',
      '/admin'
    );
  });
});
