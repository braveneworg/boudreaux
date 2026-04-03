/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { PrismaClient } from '@prisma/client';

import { test, expect } from '../fixtures/base.fixture';

const E2E_DATABASE_URL =
  process.env.E2E_DATABASE_URL || 'mongodb://localhost:27018/boudreaux-e2e?replicaSet=rs0';

const prisma = new PrismaClient({ datasourceUrl: E2E_DATABASE_URL });

test.describe('Admin Tour Creation', () => {
  test.afterAll(async () => {
    await prisma.$disconnect();
  });

  test.afterEach(async () => {
    await prisma.tour.deleteMany({
      where: {
        title: {
          startsWith: 'E2E Create Tour',
        },
      },
    });
  });

  test('should create tour with all basic fields', async ({ adminPage }) => {
    await adminPage.goto('/admin/tours/new');

    await expect(adminPage.getByText('Create New Tour')).toBeVisible();

    const title = `E2E Create Tour - Full Fields ${Date.now()}`;

    await adminPage.fill('[name="title"]', title);
    await adminPage.fill('[name="subtitle"]', 'E2E Subtitle');
    await adminPage.fill('[name="subtitle2"]', 'E2E Subtitle 2');
    await adminPage
      .locator('textarea[name="description"]')
      .fill('E2E description for tour creation');
    await adminPage.locator('textarea[name="notes"]').fill('E2E internal notes');

    await adminPage.getByRole('button', { name: 'Create Tour', exact: true }).click();

    await expect(adminPage).toHaveURL('/admin/tours');
    await expect(adminPage.getByRole('link', { name: title })).toBeVisible();
  });

  test('should show validation errors for missing required title', async ({ adminPage }) => {
    await adminPage.goto('/admin/tours/new');

    await adminPage.getByRole('button', { name: 'Create Tour', exact: true }).click();

    await expect(adminPage.getByText('Title is required')).toBeVisible();
    await expect(adminPage).toHaveURL('/admin/tours/new');
  });

  test('should enforce title max length', async ({ adminPage }) => {
    await adminPage.goto('/admin/tours/new');

    const longTitle = 'x'.repeat(201);
    await adminPage.fill('[name="title"]', longTitle);

    await adminPage.getByRole('button', { name: 'Create Tour', exact: true }).click();

    await expect(adminPage.getByText('Title must be 200 characters or less')).toBeVisible();
  });

  test('should allow cancellation and navigate back', async ({ adminPage }) => {
    await adminPage.goto('/admin/tours');
    await adminPage.getByRole('link', { name: 'New Tour' }).click();

    await adminPage.fill('[name="title"]', 'E2E Create Tour - Cancelled');
    await adminPage.getByRole('button', { name: 'Cancel', exact: true }).click();

    await expect(adminPage).toHaveURL('/admin/tours');
    await expect(adminPage.getByText('E2E Create Tour - Cancelled')).not.toBeVisible();
  });
});
