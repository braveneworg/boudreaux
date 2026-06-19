/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { expect, test } from '../fixtures/auth.fixture';

/**
 * E2E coverage for the /admin dashboard landing.
 *
 * The dashboard replaces the old combobox view-switcher with a stats overview:
 * a tile per section (linking into it) plus a published-vs-unpublished chart.
 */

test.describe('Admin dashboard', () => {
  test('renders the dashboard heading and section overview tiles', async ({ adminPage }) => {
    await adminPage.goto('/admin');

    await expect(adminPage.getByRole('heading', { name: 'Dashboard', exact: true })).toBeVisible();

    const overview = adminPage.getByRole('list', { name: /section overview/i });
    await expect(overview.getByRole('link', { name: 'Releases' })).toBeVisible();
    await expect(overview.getByRole('link', { name: 'Tours' })).toBeVisible();
  });

  test('tiles link into their section', async ({ adminPage }) => {
    await adminPage.goto('/admin');

    const overview = adminPage.getByRole('list', { name: /section overview/i });
    await overview.getByRole('link', { name: 'Releases' }).click();

    await expect(adminPage).toHaveURL(/\/admin\/releases$/);
  });

  test('renders the published-vs-unpublished chart', async ({ adminPage }) => {
    await adminPage.goto('/admin');

    await expect(
      adminPage.getByRole('heading', { name: /published vs unpublished/i })
    ).toBeVisible();
    await expect(adminPage.locator('[data-slot="chart"]')).toBeVisible();
  });

  test('no longer renders the section combobox', async ({ adminPage }) => {
    await adminPage.goto('/admin');

    await expect(adminPage.getByRole('combobox', { name: /select a section/i })).toHaveCount(0);
  });
});
