/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

// @ts-nocheck — test scaffold; helpers and Prisma models referenced below are not yet implemented
import { test, expect } from '@playwright/test';

import { prisma } from '@/lib/prisma';

import { createTestUser, loginAsUser } from '../helpers/auth-helpers';
import { uploadTestAudioFile } from '../helpers/upload-helpers';

test.describe('User Downloads Purchased Release', () => {
  let testUser: { id: string; email: string; password: string };
  let testRelease: { id: string; title: string; slug: string };
  let testPurchase: { id: string };
  let testFormat: { id: string; formatType: string; s3Key: string };

  test.beforeAll(async () => {
    // Create test user
    testUser = await createTestUser({
      email: 'download-test@example.com',
      name: 'Download Tester',
      password: 'SecurePass123!',
    });

    // Create test release
    const artist = await prisma.artist.create({
      data: {
        name: 'Download Test Artist',
        slug: 'download-test-artist',
        bio: 'Artist for E2E download tests',
      },
    });

    testRelease = await prisma.release.create({
      data: {
        title: 'Test Release with Downloads',
        slug: 'test-release-downloads',
        releaseType: 'Album',
        releaseDate: new Date('2026-01-15'),
        artistId: artist.id,
        suggestedPrice: 1000n, // $10.00
      },
    });

    // Upload test digital format (MP3)
    testFormat = await uploadTestAudioFile({
      releaseId: testRelease.id,
      formatType: 'MP3_320KBPS',
      fileName: 'test-album.mp3',
      fileSize: 50_000_000, // 50 MB
      mimeType: 'audio/mpeg',
    });

    // Create successful purchase for test user
    testPurchase = await prisma.purchase.create({
      data: {
        userId: testUser.id,
        releaseId: testRelease.id,
        amount: 1000n,
        stripePaymentIntentId: 'pi_test_download_e2e',
        status: 'succeeded',
      },
    });
  });

  test.afterAll(async () => {
    // Cleanup test data
    await prisma.downloadEvent.deleteMany({
      where: { userId: testUser.id },
    });
    await prisma.purchase.deleteMany({
      where: { id: testPurchase.id },
    });
    await prisma.releaseDigitalFormat.deleteMany({
      where: { id: testFormat.id },
    });
    await prisma.release.deleteMany({
      where: { id: testRelease.id },
    });
    await prisma.user.deleteMany({
      where: { id: testUser.id },
    });
  });

  test('user can download purchased release in MP3 format', async ({ page }) => {
    // Login as test user
    await loginAsUser(page, testUser.email, testUser.password);

    // Navigate to release page
    await page.goto(`/releases/${testRelease.slug}`);

    // Verify release title is displayed
    await expect(page.locator('h1')).toContainText(testRelease.title);

    // Locate download button for MP3 format
    const downloadButton = page.locator('button', {
      hasText: /download.*mp3/i,
    });

    await expect(downloadButton).toBeVisible();

    // Setup download listener
    const downloadPromise = page.waitForEvent('download');

    // Click download button
    await downloadButton.click();

    // Wait for download to start
    const download = await downloadPromise;

    // Verify download filename
    expect(download.suggestedFilename()).toContain('.mp3');

    // Verify download event was logged
    const downloadEvent = await prisma.downloadEvent.findFirst({
      where: {
        userId: testUser.id,
        releaseId: testRelease.id,
        formatType: 'MP3_320KBPS',
        success: true,
      },
      orderBy: {
        downloadedAt: 'desc',
      },
    });

    expect(downloadEvent).toBeTruthy();
    expect(downloadEvent?.success).toBe(true);
  });

  test('user can download purchased release in FLAC format', async ({ page }) => {
    // Upload FLAC format
    const flacFormat = await uploadTestAudioFile({
      releaseId: testRelease.id,
      formatType: 'FLAC',
      fileName: 'test-album.flac',
      fileSize: 150_000_000, // 150 MB
      mimeType: 'audio/flac',
    });

    await loginAsUser(page, testUser.email, testUser.password);
    await page.goto(`/releases/${testRelease.slug}`);

    const downloadButton = page.locator('button', {
      hasText: /download.*flac/i,
    });

    await expect(downloadButton).toBeVisible();

    const downloadPromise = page.waitForEvent('download');
    await downloadButton.click();
    const download = await downloadPromise;

    expect(download.suggestedFilename()).toContain('.flac');

    // Cleanup
    await prisma.releaseDigitalFormat.deleteMany({
      where: { id: flacFormat.id },
    });
  });

  test('download button is disabled for unpurchased releases', async ({ page }) => {
    // Create another release without purchase
    const unpurchasedRelease = await prisma.release.create({
      data: {
        title: 'Unpurchased Release',
        slug: 'unpurchased-release',
        releaseType: 'Single',
        releaseDate: new Date('2026-02-01'),
        artistId: testRelease.artistId,
        suggestedPrice: 500n,
      },
    });

    // Upload format for unpurchased release
    const unpurchasedFormat = await uploadTestAudioFile({
      releaseId: unpurchasedRelease.id,
      formatType: 'MP3_320KBPS',
      fileName: 'unpurchased.mp3',
      fileSize: 30_000_000,
      mimeType: 'audio/mpeg',
    });

    await loginAsUser(page, testUser.email, testUser.password);
    await page.goto(`/releases/${unpurchasedRelease.slug}`);

    // Download button should either:
    // 1. Not be visible (replaced by "Purchase" button)
    // 2. Be disabled
    // 3. Show error message when clicked

    const downloadButton = page.locator('button', {
      hasText: /download/i,
    });

    if (await downloadButton.isVisible()) {
      await expect(downloadButton).toBeDisabled();
    } else {
      // Purchase button should be visible instead
      const purchaseButton = page.locator('button', {
        hasText: /purchase|buy/i,
      });
      await expect(purchaseButton).toBeVisible();
    }

    // Cleanup
    await prisma.releaseDigitalFormat.deleteMany({
      where: { id: unpurchasedFormat.id },
    });
    await prisma.release.deleteMany({
      where: { id: unpurchasedRelease.id },
    });
  });

  test('download fails gracefully when format is soft-deleted beyond grace period', async ({
    page,
  }) => {
    // Create format and soft-delete it 100 days ago (beyond 90-day grace period)
    const deletedAt = new Date(Date.now() - 100 * 24 * 60 * 60 * 1000);

    const expiredFormat = await prisma.releaseDigitalFormat.create({
      data: {
        releaseId: testRelease.id,
        formatType: 'WAV',
        s3Key: `releases/${testRelease.id}/audio/wav_expired.wav`,
        fileName: 'expired.wav',
        fileSize: 400_000_000n,
        mimeType: 'audio/wav',
        checksum: 'expired_checksum',
        deletedAt,
      },
    });

    await loginAsUser(page, testUser.email, testUser.password);
    await page.goto(`/releases/${testRelease.slug}`);

    // WAV download button should either not exist or show error when clicked
    const wavButton = page.locator('button', {
      hasText: /download.*wav/i,
    });

    if (await wavButton.isVisible()) {
      await wavButton.click();

      // Expect error message to appear
      const errorMessage = page.locator('[role="alert"]', {
        hasText: /no longer available|expired/i,
      });
      await expect(errorMessage).toBeVisible();
    } else {
      // WAV option is not shown, which is correct
      expect(true).toBe(true);
    }

    // Cleanup
    await prisma.releaseDigitalFormat.deleteMany({
      where: { id: expiredFormat.id },
    });
  });

  test('unauthenticated users cannot download purchased releases', async ({ page }) => {
    // Navigate to release page without logging in
    await page.goto(`/releases/${testRelease.slug}`);

    // Download buttons should either:
    // 1. Not be visible (requires login)
    // 2. Redirect to login when clicked

    const downloadButton = page.locator('button', {
      hasText: /download/i,
    });

    if (await downloadButton.isVisible()) {
      await downloadButton.click();

      // Should redirect to login or show error
      await expect(page).toHaveURL(/\/auth\/login/);
    } else {
      // Login prompt should be visible instead
      const loginPrompt = page.locator('text=/sign in|log in|login/i');
      await expect(loginPrompt).toBeVisible();
    }
  });

  test('download analytics are tracked correctly', async ({ page }) => {
    // Clear previous download events for clean test
    await prisma.downloadEvent.deleteMany({
      where: {
        userId: testUser.id,
        releaseId: testRelease.id,
      },
    });

    await loginAsUser(page, testUser.email, testUser.password);
    await page.goto(`/releases/${testRelease.slug}`);

    const downloadButton = page.locator('button', {
      hasText: /download.*mp3/i,
    });

    // Perform 3 downloads
    for (let i = 0; i < 3; i++) {
      const downloadPromise = page.waitForEvent('download');
      await downloadButton.click();
      await downloadPromise;

      // Small delay between downloads
      await page.waitForTimeout(500);
    }

    // Verify 3 download events were logged
    const downloadCount = await prisma.downloadEvent.count({
      where: {
        userId: testUser.id,
        releaseId: testRelease.id,
        formatType: 'MP3_320KBPS',
        success: true,
      },
    });

    expect(downloadCount).toBe(3);
  });
});
