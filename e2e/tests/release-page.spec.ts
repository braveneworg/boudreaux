/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { PrismaClient } from '@prisma/client';

import { expect, test } from '../fixtures/base.fixture';

const E2E_DATABASE_URL =
  process.env.E2E_DATABASE_URL || 'mongodb://localhost:27018/boudreaux-e2e?replicaSet=rs0';

const prisma = new PrismaClient({ datasourceUrl: E2E_DATABASE_URL });

let e2eRelease1Id: string;
let e2eRelease2Id: string;

test.beforeAll(async () => {
  const [release1, release2] = await Promise.all([
    prisma.release.findFirstOrThrow({
      where: { title: 'E2E Album One' },
      select: { id: true },
    }),
    prisma.release.findFirstOrThrow({
      where: { title: 'E2E Album Two' },
      select: { id: true },
    }),
  ]);
  e2eRelease1Id = release1.id;
  e2eRelease2Id = release2.id;
});

test.afterAll(async () => {
  await prisma.$disconnect();
});

test.describe('Release Page — Player and Navigation', () => {
  test('displays release player with cover art and track info', async ({ userPage }) => {
    await userPage.goto(`/releases/${e2eRelease1Id}`);

    // Breadcrumb should show "Releases" and the release title
    await expect(userPage.getByRole('link', { name: 'Releases' })).toBeVisible({ timeout: 10_000 });
    await expect(userPage.getByRole('link', { name: 'E2E Album One' })).toBeVisible();

    // Cover art should be visible (inside the Play button)
    await expect(
      userPage
        .getByRole('button', { name: 'Play' })
        .first()
        .getByRole('img', { name: /E2E Album One cover art/ })
    ).toBeVisible();
  });

  test('shows download trigger button on release page', async ({ userPage }) => {
    await userPage.goto(`/releases/${e2eRelease1Id}`);

    // The download trigger button should be visible on the player
    await expect(userPage.getByRole('button', { name: 'Download' })).toBeVisible({
      timeout: 10_000,
    });
  });

  test('navigates between releases via breadcrumb', async ({ userPage }) => {
    await userPage.goto(`/releases/${e2eRelease1Id}`);

    // Click "Releases" breadcrumb to go back to releases list
    const releasesLink = userPage.getByRole('link', { name: 'Releases' });
    await expect(releasesLink).toBeVisible({ timeout: 10_000 });
    await releasesLink.click();

    // Should navigate to releases page
    await userPage.waitForURL(/\/releases/);
  });
});

test.describe('Release Page — Purchase State Awareness', () => {
  test('purchased release shows returning purchaser dialog', async ({ userPage }) => {
    // Regular user has purchased E2E Album One
    await userPage.goto(`/releases/${e2eRelease1Id}`);

    const downloadButton = userPage.getByRole('button', { name: 'Download' });
    await expect(downloadButton).toBeVisible({ timeout: 10_000 });
    await downloadButton.click();

    // Should recognize user as a returning purchaser
    await expect(userPage.getByText('You already purchased this on')).toBeVisible({
      timeout: 10_000,
    });

    // Should NOT show the "Buy & Download" button (already purchased)
    await expect(userPage.getByRole('button', { name: /Buy & Download/i })).not.toBeVisible();
  });

  test('unpurchased release shows free/premium download options', async ({ userPage }) => {
    // Regular user has NOT purchased E2E Album Two
    await userPage.goto(`/releases/${e2eRelease2Id}`);

    const downloadButton = userPage.getByRole('button', { name: 'Download' });
    await expect(downloadButton).toBeVisible({ timeout: 10_000 });
    await downloadButton.click();

    // Should show the initial download choice dialog with radio options
    await expect(userPage.getByLabel(/Free.*320Kbps/)).toBeVisible({ timeout: 5_000 });
    await expect(userPage.getByLabel(/Premium digital formats/)).toBeVisible();
  });
});

test.describe('Release Page — Artist Carousel', () => {
  test('shows artist releases carousel with other albums', async ({ userPage }) => {
    // E2E Album One is linked to E2E Artist who has 3 albums
    await userPage.goto(`/releases/${e2eRelease1Id}`);

    // The carousel should be a region labeled "Other releases by E2E Artist"
    await expect(
      userPage.getByRole('region', { name: /Other releases by E2E Artist/ })
    ).toBeVisible({ timeout: 10_000 });
  });
});
