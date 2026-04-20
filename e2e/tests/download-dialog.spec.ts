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

    // Dialog should recognize the user as a returning purchaser
    await expect(userPage.getByText('You already purchased this on')).toBeVisible({
      timeout: 10_000,
    });
  });

  test('shows format options via multi-combobox', async ({ userPage }) => {
    await userPage.goto(`/releases/${e2eRelease1Id}`);

    const downloadButton = userPage.getByRole('button', { name: 'Download music' });
    await expect(downloadButton).toBeVisible({ timeout: 10_000 });
    await downloadButton.click();

    // Should show a multi-combobox for format selection
    const combobox = userPage.getByRole('combobox');
    await expect(combobox).toBeVisible();
    await combobox.click();

    // E2E Album One has MP3_320KBPS, FLAC, and WAV seeded — verify options in dropdown
    await expect(userPage.getByRole('option', { name: /FLAC/i })).toBeVisible({ timeout: 5_000 });
    await expect(userPage.getByRole('option', { name: /WAV/i })).toBeVisible();
    await expect(userPage.getByRole('option', { name: /MP3 320kbps/i })).toBeVisible();
  });

  test('shows download button with format count after selecting formats', async ({ userPage }) => {
    await userPage.goto(`/releases/${e2eRelease1Id}`);

    const downloadButton = userPage.getByRole('button', { name: 'Download music' });
    await expect(downloadButton).toBeVisible({ timeout: 10_000 });
    await downloadButton.click();

    // Select all formats via the multi-combobox
    const combobox = userPage.getByRole('combobox');
    await combobox.click();
    await userPage.getByRole('option', { name: 'Select all' }).click();
    await userPage.keyboard.press('Escape');

    // All 3 formats selected — should show "Download 3 formats"
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
    await expect(userPage.getByRole('heading', { name: 'Download', exact: true })).toBeVisible({
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
    await expect(userPage.getByRole('heading', { name: 'Download', exact: true })).toBeVisible({
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
    await expect(userPage.getByRole('heading', { name: 'Download', exact: true })).toBeVisible({
      timeout: 5_000,
    });

    // Select premium digital formats option
    const premiumOption = userPage.getByLabel(/Premium digital formats/);
    await premiumOption.click();

    // Should show custom amount input
    await expect(userPage.getByLabel('Custom amount')).toBeVisible({ timeout: 5_000 });
  });
});

test.describe('Download Dialog — Multi-format selection', () => {
  let e2eRelease1Id: string;

  test.beforeAll(async () => {
    const release = await prisma.release.findFirstOrThrow({
      where: { title: 'E2E Album One' },
      select: { id: true },
    });
    e2eRelease1Id = release.id;
  });

  test('can select and deselect formats via multi-combobox', async ({ userPage }) => {
    await userPage.goto(`/releases/${e2eRelease1Id}`);

    const downloadButton = userPage.getByRole('button', { name: 'Download music' });
    await expect(downloadButton).toBeVisible({ timeout: 10_000 });
    await downloadButton.click();

    // Open the multi-combobox
    const combobox = userPage.getByRole('combobox');
    await expect(combobox).toBeVisible({ timeout: 5_000 });
    await combobox.click();

    // Select all formats
    await userPage.getByRole('option', { name: 'Select all' }).click();

    // Verify the combobox trigger shows the selected count
    await expect(combobox).toContainText('3 formats selected');

    // Deselect an individual format (WAV)
    await userPage.getByRole('option', { name: /WAV/i }).click();

    // Count should decrease to 2
    await expect(combobox).toContainText('2 formats selected');
  });

  test('shows selected format pills below combobox', async ({ userPage }) => {
    await userPage.goto(`/releases/${e2eRelease1Id}`);

    const downloadButton = userPage.getByRole('button', { name: 'Download music' });
    await expect(downloadButton).toBeVisible({ timeout: 10_000 });
    await downloadButton.click();

    // Open the multi-combobox and select all formats
    const combobox = userPage.getByRole('combobox');
    await expect(combobox).toBeVisible({ timeout: 5_000 });
    await combobox.click();
    await userPage.getByRole('option', { name: 'Select all' }).click();
    await userPage.keyboard.press('Escape');

    // Verify pills are shown with format labels
    const pillList = userPage.getByRole('list', { name: 'Selected formats' });
    await expect(pillList).toBeVisible();
    await expect(pillList.getByRole('listitem').filter({ hasText: /FLAC/ })).toBeVisible();
    await expect(pillList.getByRole('listitem').filter({ hasText: /WAV/ })).toBeVisible();
    await expect(pillList.getByRole('listitem').filter({ hasText: /MP3 320kbps/ })).toBeVisible();
  });
});

test.describe('Download Dialog — Free download flow', () => {
  let e2eRelease2Id: string;

  test.beforeAll(async () => {
    const release = await prisma.release.findFirstOrThrow({
      where: { title: 'E2E Album Two' },
      select: { id: true },
    });
    e2eRelease2Id = release.id;
  });

  test('can select free download option and proceed', async ({ userPage }) => {
    await userPage.goto(`/releases/${e2eRelease2Id}`);

    const downloadButton = userPage.getByRole('button', { name: 'Download music' });
    await expect(downloadButton).toBeVisible({ timeout: 10_000 });
    await downloadButton.click();

    // Wait for dialog
    await expect(userPage.getByRole('heading', { name: 'Download', exact: true })).toBeVisible({
      timeout: 5_000,
    });

    // Select the free download option
    const freeOption = userPage.getByLabel(/Free.*320Kbps/);
    await freeOption.click();

    // Click the Download button to proceed
    const submitButton = userPage.getByRole('button', { name: 'Download', exact: true });
    await expect(submitButton).toBeVisible({ timeout: 5_000 });
    await submitButton.click();
  });
});
