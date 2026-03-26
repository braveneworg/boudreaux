/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { test, expect } from '@playwright/test';
import { PrismaClient } from '@prisma/client';

import { createAuthCookie } from '../helpers/auth-helpers';
import { uploadTestAudioFile } from '../helpers/upload-helpers';

import type { TestUser } from '../helpers/auth-helpers';
import type { Page } from '@playwright/test';

/**
 * Use the E2E database directly (same URL as the test server) so that
 * beforeAll/afterAll run against the correct isolated database.
 */
const E2E_DATABASE_URL =
  process.env.E2E_DATABASE_URL || 'mongodb://localhost:27018/boudreaux-e2e?replicaSet=rs0';

/**
 * Must match playwright.config.ts webServer.env.AUTH_SECRET so that cookies
 * generated here are accepted by the running Next.js app.
 */
const AUTH_SECRET = 'e2e-test-secret-key-that-is-at-least-32-characters-long';

const prisma = new PrismaClient({ datasourceUrl: E2E_DATABASE_URL });

async function loginAs(page: Page, user: TestUser): Promise<void> {
  const cookie = await createAuthCookie(user, AUTH_SECRET);
  await page.context().addCookies([cookie]);
}

test.describe('User Downloads Purchased Release', () => {
  let testUser: TestUser;
  let testReleaseId: string;
  let testPurchaseId: string;

  test.beforeAll(async () => {
    const user = await prisma.user.create({
      data: {
        email: 'download-test@example.com',
        name: 'Download Tester',
        username: 'download-tester-e2e',
        role: 'user',
        emailVerified: new Date(),
        termsAndConditions: true,
      },
    });

    testUser = {
      id: user.id,
      email: user.email,
      name: user.name ?? 'Download Tester',
      username: user.username ?? 'download-tester-e2e',
      role: 'user',
    };

    const release = await prisma.release.create({
      data: {
        title: 'Test Release with Downloads',
        releasedOn: new Date('2026-01-15'),
        coverArt: 'https://picsum.photos/seed/download-test/400/400',
        suggestedPrice: 1000,
      },
    });

    testReleaseId = release.id;

    await uploadTestAudioFile({
      releaseId: testReleaseId,
      formatType: 'MP3_320KBPS',
      fileName: 'test-album.mp3',
      fileSize: 50_000_000,
      mimeType: 'audio/mpeg',
    });

    const purchase = await prisma.releasePurchase.create({
      data: {
        userId: testUser.id,
        releaseId: testReleaseId,
        amountPaid: 1000,
        stripePaymentIntentId: 'pi_test_download_e2e',
      },
    });

    testPurchaseId = purchase.id;
  });

  test.afterAll(async () => {
    await prisma.downloadEvent.deleteMany({ where: { userId: testUser.id } });
    await prisma.releasePurchase.deleteMany({ where: { id: testPurchaseId } });
    await prisma.releaseDigitalFormat.deleteMany({ where: { releaseId: testReleaseId } });
    await prisma.release.deleteMany({ where: { id: testReleaseId } });
    await prisma.user.deleteMany({ where: { id: testUser.id } });
    await prisma.$disconnect();
  });

  test('user can download purchased release in MP3 format', async ({ page }) => {
    await loginAs(page, testUser);
    await page.goto(`/releases/${testReleaseId}`);

    await expect(page.locator('h1')).toContainText('Test Release with Downloads');

    const downloadButton = page.locator('button', { hasText: /download.*mp3/i });
    await expect(downloadButton).toBeVisible();

    const downloadPromise = page.waitForEvent('download');
    await downloadButton.click();
    const download = await downloadPromise;

    expect(download.suggestedFilename()).toContain('.mp3');

    const downloadEvent = await prisma.downloadEvent.findFirst({
      where: {
        userId: testUser.id,
        releaseId: testReleaseId,
        formatType: 'MP3_320KBPS',
        success: true,
      },
      orderBy: { downloadedAt: 'desc' },
    });

    expect(downloadEvent).toBeTruthy();
    expect(downloadEvent?.success).toBe(true);
  });

  test('user can download purchased release in FLAC format', async ({ page }) => {
    const flacFormat = await uploadTestAudioFile({
      releaseId: testReleaseId,
      formatType: 'FLAC',
      fileName: 'test-album.flac',
      fileSize: 150_000_000,
      mimeType: 'audio/flac',
    });

    await loginAs(page, testUser);
    await page.goto(`/releases/${testReleaseId}`);

    const downloadButton = page.locator('button', { hasText: /download.*flac/i });
    await expect(downloadButton).toBeVisible();

    const downloadPromise = page.waitForEvent('download');
    await downloadButton.click();
    const download = await downloadPromise;

    expect(download.suggestedFilename()).toContain('.flac');

    await prisma.releaseDigitalFormat.deleteMany({ where: { id: flacFormat.id } });
  });

  test('download button is disabled for unpurchased releases', async ({ page }) => {
    const unpurchasedRelease = await prisma.release.create({
      data: {
        title: 'Unpurchased Release E2E',
        releasedOn: new Date('2026-02-01'),
        coverArt: 'https://picsum.photos/seed/unpurchased-test/400/400',
        suggestedPrice: 500,
      },
    });

    const unpurchasedFormat = await uploadTestAudioFile({
      releaseId: unpurchasedRelease.id,
      formatType: 'MP3_320KBPS',
      fileName: 'unpurchased.mp3',
      fileSize: 30_000_000,
      mimeType: 'audio/mpeg',
    });

    await loginAs(page, testUser);
    await page.goto(`/releases/${unpurchasedRelease.id}`);

    const downloadButton = page.locator('button', { hasText: /download/i });

    if (await downloadButton.isVisible()) {
      await expect(downloadButton).toBeDisabled();
    } else {
      const purchaseButton = page.locator('button', { hasText: /purchase|buy/i });
      await expect(purchaseButton).toBeVisible();
    }

    await prisma.releaseDigitalFormat.deleteMany({ where: { id: unpurchasedFormat.id } });
    await prisma.release.deleteMany({ where: { id: unpurchasedRelease.id } });
  });

  test('download fails gracefully when format is soft-deleted beyond grace period', async ({
    page,
  }) => {
    const deletedAt = new Date(Date.now() - 100 * 24 * 60 * 60 * 1000);

    const expiredFormat = await prisma.releaseDigitalFormat.create({
      data: {
        releaseId: testReleaseId,
        formatType: 'WAV',
        s3Key: `releases/${testReleaseId}/audio/wav_expired.wav`,
        fileName: 'expired.wav',
        fileSize: BigInt(400_000_000),
        mimeType: 'audio/wav',
        checksum: 'expired_checksum',
        deletedAt,
      },
    });

    await loginAs(page, testUser);
    await page.goto(`/releases/${testReleaseId}`);

    const wavButton = page.locator('button', { hasText: /download.*wav/i });

    if (await wavButton.isVisible()) {
      await wavButton.click();
      const errorMessage = page.locator('[role="alert"]', {
        hasText: /no longer available|expired/i,
      });
      await expect(errorMessage).toBeVisible();
    } else {
      expect(true).toBe(true);
    }

    await prisma.releaseDigitalFormat.deleteMany({ where: { id: expiredFormat.id } });
  });

  test('unauthenticated users cannot download purchased releases', async ({ page }) => {
    await page.goto(`/releases/${testReleaseId}`);

    const downloadButton = page.locator('button', { hasText: /download/i });

    if (await downloadButton.isVisible()) {
      await downloadButton.click();
      await expect(page).toHaveURL(/\/auth\/login/);
    } else {
      const loginPrompt = page.locator('text=/sign in|log in|login/i');
      await expect(loginPrompt).toBeVisible();
    }
  });

  test('download analytics are tracked correctly', async ({ page }) => {
    await prisma.downloadEvent.deleteMany({
      where: { userId: testUser.id, releaseId: testReleaseId },
    });

    await loginAs(page, testUser);
    await page.goto(`/releases/${testReleaseId}`);

    const downloadButton = page.locator('button', { hasText: /download.*mp3/i });

    for (let i = 0; i < 3; i++) {
      const downloadPromise = page.waitForEvent('download');
      await downloadButton.click();
      await downloadPromise;
      await page.waitForTimeout(500);
    }

    const downloadCount = await prisma.downloadEvent.count({
      where: {
        userId: testUser.id,
        releaseId: testReleaseId,
        formatType: 'MP3_320KBPS',
        success: true,
      },
    });

    expect(downloadCount).toBe(3);
  });
});
