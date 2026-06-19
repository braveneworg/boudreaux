/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { PrismaClient } from '@prisma/client';

import { expect, test } from '../fixtures/auth.fixture';

/**
 * Admin → public propagation for the new TanStack Query mutation hooks
 * (src/app/hooks/mutations/). These assert the *integration path* end to end:
 * an admin write through the hook → Server Action → revalidatePath / cache
 * invalidation → the change visible on the public surface.
 *
 * Each test creates and cleans up its own entities, so it never mutates the
 * shared seed data other specs assert on.
 */

const E2E_DATABASE_URL =
  process.env.E2E_DATABASE_URL || 'mongodb://localhost:27018/boudreaux-e2e?replicaSet=rs0';

const prisma = new PrismaClient({ datasourceUrl: E2E_DATABASE_URL });

test.describe('Mutation hook integration (admin → public)', () => {
  // Worker-local list of tour titles created by these tests, cleaned up by
  // exact title so parallel specs are unaffected.
  const createdTourTitles: string[] = [];

  test.afterAll(async () => {
    await prisma.$disconnect();
  });

  test.afterEach(async () => {
    if (createdTourTitles.length > 0) {
      await prisma.tour.deleteMany({ where: { title: { in: createdTourTitles } } });
      createdTourTitles.length = 0;
    }
  });

  test('useCreateTourMutation: a created tour appears on the public /tours page', async ({
    adminPage,
  }) => {
    const title = `E2E Mutation Create Tour ${Date.now()}`;
    createdTourTitles.push(title);

    await adminPage.goto('/admin/tours/new');
    const heading = adminPage.getByText('Create New Tour');
    await expect(heading).toHaveCount(1);
    await adminPage.fill('[name="title"]', title);
    await adminPage.getByRole('button', { name: 'Create Tour', exact: true }).click();

    // Admin list reflects the create (mutation onSuccess + redirect).
    await expect(adminPage).toHaveURL('/admin/tours');
    await expect(adminPage.getByRole('link', { name: title })).toBeVisible();

    // Public listing reflects it too (revalidatePath('/tours')).
    await adminPage.goto('/tours');
    await expect(adminPage.getByRole('link', { name: title })).toBeVisible({ timeout: 15_000 });
  });

  test('useUpdateTourMutation: an edited tour title propagates to /tours', async ({
    adminPage,
  }) => {
    const originalTitle = `E2E Mutation Update Tour ${Date.now()}`;
    const editedTitle = `${originalTitle} (edited)`;
    createdTourTitles.push(originalTitle, editedTitle);

    // Create the tour via the UI (exercises useCreateTourMutation).
    await adminPage.goto('/admin/tours/new');
    await expect(adminPage.getByText('Create New Tour')).toHaveCount(1);
    await adminPage.fill('[name="title"]', originalTitle);
    await adminPage.getByRole('button', { name: 'Create Tour', exact: true }).click();
    await expect(adminPage).toHaveURL('/admin/tours');

    // Open the edit view and rename it (exercises useUpdateTourMutation).
    await adminPage.getByRole('link', { name: originalTitle }).click();
    await expect(adminPage).toHaveURL(/\/admin\/tours\/[a-f0-9]{24}$/);
    // Wait for the edit form to hydrate with the tour's current title.
    await expect(adminPage.locator('[name="title"]')).toHaveValue(originalTitle, {
      timeout: 15_000,
    });
    await adminPage.fill('[name="title"]', editedTitle);
    await adminPage.getByRole('button', { name: 'Update Tour', exact: true }).click();
    await expect(adminPage).toHaveURL('/admin/tours');

    // Public listing shows the new title and no longer the old one.
    await adminPage.goto('/tours');
    await expect(adminPage.getByRole('link', { name: editedTitle })).toBeVisible({
      timeout: 15_000,
    });
    await expect(adminPage.getByRole('link', { name: originalTitle, exact: true })).toHaveCount(0);
  });

  test('usePublishFeaturedArtistsMutation: publishing to the landing page succeeds', async ({
    adminPage,
  }) => {
    await adminPage.goto('/admin/featured-artists');

    await adminPage.getByRole('button', { name: /publish to landing page/i }).click();

    await expect(adminPage.getByText('Featured artists published to landing page')).toBeVisible({
      timeout: 15_000,
    });
  });
});
