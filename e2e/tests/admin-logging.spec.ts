/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { expect, test } from '../fixtures/auth.fixture';

/**
 * E2E coverage for the /admin/logging page. The log-level control uses enlarged
 * radio buttons; this verifies they render and remain selectable.
 */

test.describe('Admin logging', () => {
  test('renders the logging section header', async ({ adminPage }) => {
    await adminPage.goto('/admin/logging');

    await expect(adminPage.getByRole('heading', { name: 'Logging', exact: true })).toBeVisible();
  });

  test('exposes selectable log-level radio buttons', async ({ adminPage }) => {
    await adminPage.goto('/admin/logging');

    const radios = adminPage.getByRole('radio');
    await expect(radios.first()).toBeVisible();
    expect(await radios.count()).toBeGreaterThanOrEqual(4);
  });

  test('lets an admin select a different log level', async ({ adminPage }) => {
    await adminPage.goto('/admin/logging');

    const debug = adminPage.getByRole('radio', { name: 'debug' });
    await debug.click();

    await expect(debug).toBeChecked();
  });
});
