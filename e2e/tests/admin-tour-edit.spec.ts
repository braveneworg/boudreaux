/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { test, expect } from '../fixtures/base.fixture';

import type { Page } from '@playwright/test';

const createTourViaUi = async (
  adminPage: Page,
  data: {
    title: string;
    subtitle?: string;
    subtitle2?: string;
    description?: string;
    notes?: string;
  }
) => {
  await adminPage.goto('/admin/tours/new');

  await adminPage.fill('[name="title"]', data.title);
  if (data.subtitle) await adminPage.fill('[name="subtitle"]', data.subtitle);
  if (data.subtitle2) await adminPage.fill('[name="subtitle2"]', data.subtitle2);
  if (data.description) {
    await adminPage.locator('textarea[name="description"]').fill(data.description);
  }
  if (data.notes) await adminPage.locator('textarea[name="notes"]').fill(data.notes);

  await adminPage.getByRole('button', { name: 'Create Tour', exact: true }).click();
  await expect(adminPage).toHaveURL('/admin/tours');

  // The create action revalidates /admin/tours, but the redirected SSR render
  // can lag under heavy parallel CI load. The list is server-rendered (no
  // client refetch to await), so reload-and-retry to force a fresh render
  // that includes the just-created tour rather than polling stale DOM.
  const tourLink = adminPage.getByRole('link', { name: data.title }).first();
  await expect(async () => {
    if (!(await tourLink.isVisible())) {
      await adminPage.reload();
    }
    await expect(tourLink).toBeVisible({ timeout: 3000 });
  }).toPass({ timeout: 25_000 });

  const href = await tourLink.getAttribute('href');
  if (!href) throw new Error('expected the link to have an href');

  const id = href.split('/').at(-1);
  if (!id) throw new Error('expected an id segment in the link href');

  return id;
};

test.describe('Admin Tour Editing', () => {
  test('should load existing tour data in form', async ({ adminPage }) => {
    const title = `E2E Edit Tour - Original Title ${Date.now()}`;
    const tourId = await createTourViaUi(adminPage, {
      title,
      subtitle: 'Original Subtitle',
      subtitle2: 'Original Subtitle 2',
      description: 'Original description',
      notes: 'Original notes',
    });

    await adminPage.goto(`/admin/tours/${tourId}`);

    await expect(
      adminPage.locator('[data-slot="card-title"]', { hasText: 'Edit Tour' })
    ).toBeVisible();
    await expect(adminPage.locator('[name="title"]')).toHaveValue(title);
    await expect(adminPage.locator('[name="subtitle"]')).toHaveValue('Original Subtitle');
    await expect(adminPage.locator('[name="subtitle2"]')).toHaveValue('Original Subtitle 2');
    await expect(adminPage.locator('textarea[name="description"]')).toHaveValue(
      'Original description'
    );
    await expect(adminPage.locator('textarea[name="notes"]')).toHaveValue('Original notes');
  });

  test('should update tour title and subtitle', async ({ adminPage }) => {
    const initialTitle = `E2E Edit Tour - Base ${Date.now()}`;
    const tourId = await createTourViaUi(adminPage, { title: initialTitle });

    await adminPage.goto(`/admin/tours/${tourId}`);

    const updatedTitle = `E2E Edit Tour - Updated ${Date.now()}`;

    await adminPage.fill('[name="title"]', updatedTitle);
    await adminPage.fill('[name="subtitle"]', 'Updated Subtitle');

    await adminPage.getByRole('button', { name: 'Update Tour', exact: true }).click();

    await expect(adminPage).toHaveURL('/admin/tours');
    await expect(adminPage.getByRole('link', { name: updatedTitle })).toBeVisible();
  });

  test('should clear optional fields', async ({ adminPage }) => {
    const title = `E2E Edit Tour - Optionals ${Date.now()}`;
    const tourId = await createTourViaUi(adminPage, {
      title,
      subtitle: 'Original Subtitle',
      subtitle2: 'Original Subtitle 2',
      description: 'Original description',
      notes: 'Original notes',
    });

    await adminPage.goto(`/admin/tours/${tourId}`);

    await adminPage.fill('[name="subtitle"]', '');
    await adminPage.fill('[name="subtitle2"]', '');
    await adminPage.locator('textarea[name="description"]').fill('');
    await adminPage.locator('textarea[name="notes"]').fill('');

    await adminPage.getByRole('button', { name: 'Update Tour', exact: true }).click();

    await expect(adminPage).toHaveURL('/admin/tours');
    await adminPage.getByRole('link', { name: title }).click();
    await expect(adminPage.locator('[name="subtitle"]')).toHaveValue('');
    await expect(adminPage.locator('[name="subtitle2"]')).toHaveValue('');
    await expect(adminPage.locator('textarea[name="description"]')).toHaveValue('');
    await expect(adminPage.locator('textarea[name="notes"]')).toHaveValue('');
  });

  test('should validate required title on edit', async ({ adminPage }) => {
    const title = `E2E Edit Tour - Validation ${Date.now()}`;
    const tourId = await createTourViaUi(adminPage, { title });

    await adminPage.goto(`/admin/tours/${tourId}`);

    await adminPage.fill('[name="title"]', '');
    await adminPage.getByRole('button', { name: 'Update Tour', exact: true }).click();

    await expect(adminPage.getByText('Title is required')).toBeVisible();
    await expect(adminPage).toHaveURL(`/admin/tours/${tourId}`);
  });

  test('should allow canceling edit and navigate back', async ({ adminPage }) => {
    const title = `E2E Edit Tour - Cancel ${Date.now()}`;
    const tourId = await createTourViaUi(adminPage, { title });

    await adminPage.goto('/admin/tours');
    await adminPage.goto(`/admin/tours/${tourId}`);

    await adminPage.fill('[name="title"]', 'E2E Edit Tour - Unsaved');
    await adminPage.getByRole('button', { name: 'Cancel', exact: true }).click();

    await expect(adminPage).toHaveURL('/admin/tours');
    await expect(adminPage.getByRole('link', { name: title })).toBeVisible();
  });

  test('should handle non-existent tour route', async ({ adminPage }) => {
    await adminPage.goto('/admin/tours/nonexistent-id');

    await expect(
      adminPage.locator('[data-slot="card-title"]', { hasText: 'Edit Tour' })
    ).toBeVisible();
  });
});
