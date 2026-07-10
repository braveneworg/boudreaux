/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { ADMIN_NAV_ITEMS } from '@/app/admin/components/admin-nav-items';

import { expect, test } from '../fixtures/auth.fixture';

import type { Page } from '@playwright/test';

/**
 * E2E coverage for the persistent admin top navigation.
 *
 * The nav lives in the admin layout, so it must render on the dashboard and on
 * every section page/subpage, in importance order with the current section
 * marked. The expected labels are derived from `ADMIN_NAV_ITEMS` — the single
 * source of truth shared by the nav, dashboard tiles, and tests — so adding a
 * section can't drift this list out of sync (as the Settings section once did).
 */

const NAV_ORDER = ADMIN_NAV_ITEMS.map((item) => item.label);

const adminNav = (adminPage: Page) =>
  adminPage.getByRole('navigation', { name: /admin sections/i });

test.describe('Admin persistent navigation', () => {
  test('renders every section link in importance order, releases first', async ({ adminPage }) => {
    await adminPage.goto('/admin');

    const labels = await adminNav(adminPage).getByRole('link').allTextContents();

    expect(labels.map((label) => label.trim())).toEqual(NAV_ORDER);
  });

  test('places Videos immediately after Releases', async ({ adminPage }) => {
    await adminPage.goto('/admin');

    const labels = (await adminNav(adminPage).getByRole('link').allTextContents()).map((label) =>
      label.trim()
    );

    expect(labels).toContain('Videos');
    expect(labels.indexOf('Videos')).toBe(labels.indexOf('Releases') + 1);
  });

  test('persists across section pages and subpages', async ({ adminPage }) => {
    await adminPage.goto('/admin/releases');
    await expect(adminNav(adminPage)).toBeVisible();

    await adminPage.goto('/admin/tours/new');
    await expect(adminNav(adminPage)).toBeVisible();
    await expect(adminNav(adminPage).getByRole('link', { name: 'Tours' })).toBeVisible();
  });

  test('marks the active section with aria-current', async ({ adminPage }) => {
    await adminPage.goto('/admin/logging');

    await expect(adminNav(adminPage).getByRole('link', { name: 'Logging' })).toHaveAttribute(
      'aria-current',
      'page'
    );
    await expect(adminNav(adminPage).getByRole('link', { name: 'Releases' })).not.toHaveAttribute(
      'aria-current',
      'page'
    );
  });

  test('navigates between sections via the nav links', async ({ adminPage }) => {
    await adminPage.goto('/admin');

    await adminNav(adminPage).getByRole('link', { name: 'Notifications' }).click();
    await expect(adminPage).toHaveURL(/\/admin\/notifications$/);
    await expect(adminPage.getByRole('heading', { name: /banner notifications/i })).toBeVisible();
  });
});
