/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { PrismaClient } from '@prisma/client';

import { expect, test } from '../fixtures/base.fixture';

/**
 * Use the E2E database directly so we can look up release IDs for navigation.
 */
const E2E_DATABASE_URL =
  process.env.E2E_DATABASE_URL || 'mongodb://localhost:27018/boudreaux-e2e?replicaSet=rs0';

const prisma = new PrismaClient({ datasourceUrl: E2E_DATABASE_URL });

let e2eRelease1Id: string;

test.beforeAll(async () => {
  const release = await prisma.release.findFirstOrThrow({
    where: { title: 'E2E Album One' },
    select: { id: true },
  });
  e2eRelease1Id = release.id;
});

test.afterAll(async () => {
  await prisma.$disconnect();
});

test.describe('Download Dialog — Purchased User', () => {
  test('opens download dialog and shows returning purchaser state', async ({ userPage }) => {
    await userPage.goto(`/releases/${e2eRelease1Id}`);

    // Click the download trigger button
    const downloadButton = userPage.getByRole('button', { name: 'Download music' });
    await expect(downloadButton).toBeVisible({ timeout: 10_000 });
    await downloadButton.click();

    // Dialog should open with "Download Again" heading (format-select step for purchased users)
    await expect(userPage.getByRole('heading', { name: 'Download Again' })).toBeVisible({
      timeout: 5_000,
    });
  });

  test('shows format toggle options for purchased release', async ({ userPage }) => {
    await userPage.goto(`/releases/${e2eRelease1Id}`);

    const downloadButton = userPage.getByRole('button', { name: 'Download music' });
    await downloadButton.click();

    // Wait for the dialog heading to confirm we're in the right step
    await expect(userPage.getByRole('heading', { name: 'Download Again' })).toBeVisible({
      timeout: 5_000,
    });

    // Should show format selection with toggle items for available formats
    // E2E Album One has MP3_320KBPS, FLAC, and WAV seeded
    await expect(userPage.getByRole('button', { name: /Select MP3 320kbps/i })).toBeVisible();
    await expect(userPage.getByRole('button', { name: /Select FLAC/i })).toBeVisible();
    await expect(userPage.getByRole('button', { name: /Select WAV/i })).toBeVisible();
  });

  test('shows download counter for purchased release', async ({ userPage }) => {
    await userPage.goto(`/releases/${e2eRelease1Id}`);

    const downloadButton = userPage.getByRole('button', { name: 'Download music' });
    await downloadButton.click();

    // Wait for the dialog heading
    await expect(userPage.getByRole('heading', { name: 'Download Again' })).toBeVisible({
      timeout: 5_000,
    });

    // Should show download counter "0/5 downloads used" (fresh purchase)
    await expect(userPage.getByText(/\/5 downloads used/)).toBeVisible();
  });

  test('shows download button with format count', async ({ userPage }) => {
    await userPage.goto(`/releases/${e2eRelease1Id}`);

    const downloadButton = userPage.getByRole('button', { name: 'Download music' });
    await downloadButton.click();

    // Wait for the dialog heading
    await expect(userPage.getByRole('heading', { name: 'Download Again' })).toBeVisible({
      timeout: 5_000,
    });

    // All 3 formats should be pre-selected, showing "Download 3 formats"
    await expect(userPage.getByRole('button', { name: /Download \d+ formats?/ })).toBeVisible();
  });
});

test.describe('Download Dialog — Unpurchased User (Free Tier)', () => {
  let e2eRelease2Id: string;

  test.beforeAll(async () => {
    const release = await prisma.release.findFirstOrThrow({
      where: { title: 'E2E Album Two' },
      select: { id: true },
    });
    e2eRelease2Id = release.id;
  });

  test('opens download dialog with free and premium options', async ({ userPage }) => {
    await userPage.goto(`/releases/${e2eRelease2Id}`);

    const downloadButton = userPage.getByRole('button', { name: 'Download music' });
    await expect(downloadButton).toBeVisible({ timeout: 10_000 });
    await downloadButton.click();

    // Should show the download dialog heading
    await expect(userPage.getByRole('heading', { name: 'Download' })).toBeVisible({
      timeout: 5_000,
    });

    // Should show format options: Free (320Kbps) and Premium digital formats
    await expect(userPage.getByLabel(/Free.*320Kbps/)).toBeVisible();
    await expect(userPage.getByLabel(/Premium digital formats/)).toBeVisible();
  });

  test('shows subscribe CTA in download dialog', async ({ userPage }) => {
    await userPage.goto(`/releases/${e2eRelease2Id}`);

    const downloadButton = userPage.getByRole('button', { name: 'Download music' });
    await downloadButton.click();

    // Wait for dialog
    await expect(userPage.getByRole('heading', { name: 'Download' })).toBeVisible({
      timeout: 5_000,
    });

    // Should show subscribe call-to-action
    await expect(userPage.getByRole('button', { name: /Subscribe/ })).toBeVisible();
  });

  test('shows PWYW amount input when premium option selected', async ({ userPage }) => {
    await userPage.goto(`/releases/${e2eRelease2Id}`);

    const downloadButton = userPage.getByRole('button', { name: 'Download music' });
    await downloadButton.click();

    // Wait for dialog
    await expect(userPage.getByRole('heading', { name: 'Download' })).toBeVisible({
      timeout: 5_000,
    });

    // Select premium digital formats option
    const premiumOption = userPage.getByLabel(/Premium digital formats/);
    await premiumOption.click();

    // Should show custom amount input
    await expect(userPage.getByLabel('Custom amount')).toBeVisible({ timeout: 5_000 });
  });
});
