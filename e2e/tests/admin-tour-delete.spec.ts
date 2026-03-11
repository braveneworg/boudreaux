/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { test, expect } from '../fixtures/base.fixture';

import type { Page } from '@playwright/test';

const createTourViaUi = async (adminPage: Page, title: string) => {
  await adminPage.goto('/admin/tours/new');
  await adminPage.fill('[name="title"]', title);
  await adminPage.getByRole('button', { name: 'Create Tour', exact: true }).click();
  await expect(adminPage).toHaveURL('/admin/tours');

  const tourLink = adminPage.getByRole('link', { name: title }).first();
  await expect(tourLink).toBeVisible();

  const href = await tourLink.getAttribute('href');
  expect(href).toBeTruthy();

  return href!.split('/').at(-1)!;
};

test.describe('Admin Tour Deletion', () => {
  test('should delete a tour from detail page', async ({ adminPage }) => {
    const title = `E2E Delete Tour - Primary ${Date.now()}`;
    const tourId = await createTourViaUi(adminPage, title);

    await adminPage.goto(`/admin/tours/${tourId}`);
    await adminPage.evaluate(() => {
      window.confirm = () => true;
    });

    await adminPage.getByRole('button', { name: 'Delete Tour', exact: true }).click();

    await expect(adminPage).toHaveURL('/admin/tours');
    await expect(adminPage.getByRole('link', { name: title })).toHaveCount(0);
  });

  test('should cancel deletion when confirm dialog is dismissed', async ({ adminPage }) => {
    const title = `E2E Delete Tour - Cancel ${Date.now()}`;
    const tourId = await createTourViaUi(adminPage, title);

    await adminPage.goto(`/admin/tours/${tourId}`);
    await adminPage.evaluate(() => {
      window.confirm = () => false;
    });

    await adminPage.getByRole('button', { name: 'Delete Tour', exact: true }).click();

    await expect(adminPage).toHaveURL(`/admin/tours/${tourId}`);
    await expect(adminPage.locator('[name="title"]')).toHaveValue(title);
  });

  test('should cascade delete tour images', async ({ adminPage }) => {
    const title = `E2E Delete Tour - With Images ${Date.now()}`;
    const tourId = await createTourViaUi(adminPage, title);

    await adminPage.goto(`/admin/tours/${tourId}`);
    await adminPage.evaluate(() => {
      window.confirm = () => true;
    });

    await adminPage.getByRole('button', { name: 'Delete Tour', exact: true }).click();

    await expect(adminPage).toHaveURL('/admin/tours');
    await expect(adminPage.getByRole('link', { name: title })).toHaveCount(0);
  });
});
