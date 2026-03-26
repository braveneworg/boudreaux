/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

// @ts-nocheck — test scaffold; loginAsAdmin helper is not yet implemented
/* eslint-disable no-undef */
import { test, expect } from '@playwright/test';

test.describe('Admin Upload Digital Formats', () => {
  const testReleaseTitle = 'Test Digital Album';

  test.beforeEach(async ({ page }) => {
    // Login as admin user
    await loginAsAdmin(page);
  });

  test('should display digital formats accordion on release edit page', async ({ page }) => {
    // Navigate to releases list
    await page.goto('/admin/releases');
    await expect(page).toHaveTitle(/Releases/);

    // Find and click on a release (or create one for testing)
    const releaseLink = page.getByRole('link', { name: testReleaseTitle });
    await releaseLink.click();

    // Click edit button
    await page.getByRole('button', { name: /edit/i }).click();

    // Verify digital formats accordion is present
    await expect(page.getByText('Digital Formats')).toBeVisible();
    await expect(page.getByText('MP3 320kbps')).toBeVisible();
    await expect(page.getByText('FLAC')).toBeVisible();
    await expect(page.getByText('WAV')).toBeVisible();
    await expect(page.getByText('AAC')).toBeVisible();
  });

  test('should expand accordion item and show file input', async ({ page }) => {
    // Navigate to release edit page
    await page.goto('/admin/releases');
    const releaseLink = page.getByRole('link', { name: testReleaseTitle });
    await releaseLink.click();
    await page.getByRole('button', { name: /edit/i }).click();

    // Expand MP3 accordion item
    const mp3Trigger = page.getByText('MP3 320kbps');
    await mp3Trigger.click();

    // Verify file input is visible
    const fileInput = page.getByLabel(/upload mp3/i);
    await expect(fileInput).toBeVisible();
    await expect(fileInput).toHaveAttribute('type', 'file');
    await expect(fileInput).toHaveAttribute('accept', /mp3|audio\/mpeg/);
  });

  test('should upload valid MP3 file and show checkmark indicator', async ({ page }) => {
    // Navigate to release edit page
    await page.goto('/admin/releases');
    const releaseLink = page.getByRole('link', { name: testReleaseTitle });
    await releaseLink.click();
    await page.getByRole('button', { name: /edit/i }).click();

    // Expand MP3 accordion item
    await page.getByText('MP3 320kbps').click();

    // Upload a valid MP3 file (using test fixture)
    const fileInput = page.getByLabel(/upload mp3/i);
    await fileInput.setInputFiles('e2e/fixtures/audio/sample-album.mp3');

    // Wait for upload to complete
    await expect(page.getByText(/uploading/i)).toBeVisible();
    await expect(page.getByText(/uploading/i)).toBeHidden({ timeout: 15000 });

    // Verify success message
    await expect(page.getByText(/upload successful/i)).toBeVisible({
      timeout: 5000,
    });

    // Verify checkmark indicator appears
    const checkmark = page.getByTestId('format-uploaded-checkmark');
    await expect(checkmark).toBeVisible({ timeout: 10000 });
  });

  test('should upload valid FLAC file and show checkmark', async ({ page }) => {
    // Navigate to release edit page
    await page.goto('/admin/releases');
    const releaseLink = page.getByRole('link', { name: testReleaseTitle });
    await releaseLink.click();
    await page.getByRole('button', { name: /edit/i }).click();

    // Expand FLAC accordion item
    await page.getByText('FLAC').click();

    // Upload a valid FLAC file
    const fileInput = page.getByLabel(/upload flac/i);
    await fileInput.setInputFiles('e2e/fixtures/audio/sample-album.flac');

    // Wait for upload to complete
    await expect(page.getByText(/uploading/i)).toBeVisible();
    await expect(page.getByText(/uploading/i)).toBeHidden({ timeout: 15000 });

    // Verify checkmark indicator
    const checkmark = page.getByTestId('format-uploaded-checkmark');
    await expect(checkmark).toBeVisible({ timeout: 10000 });
  });

  test('should reject file exceeding size limit', async ({ page }) => {
    // Navigate to release edit page
    await page.goto('/admin/releases');
    const releaseLink = page.getByRole('link', { name: testReleaseTitle });
    await releaseLink.click();
    await page.getByRole('button', { name: /edit/i }).click();

    // Expand MP3 accordion item
    await page.getByText('MP3 320kbps').click();

    // Attempt to upload oversized file
    const fileInput = page.getByLabel(/upload mp3/i);
    await fileInput.setInputFiles('e2e/fixtures/audio/oversized-album.mp3'); // >100MB

    // Verify error message appears
    const errorAlert = page.getByRole('alert');
    await expect(errorAlert).toBeVisible({ timeout: 5000 });
    await expect(errorAlert).toContainText(/size limit|too large/i);

    // Verify no checkmark appears
    const checkmark = page.getByTestId('format-uploaded-checkmark');
    await expect(checkmark).toBeHidden();
  });

  test('should reject file with invalid MIME type', async ({ page }) => {
    // Navigate to release edit page
    await page.goto('/admin/releases');
    const releaseLink = page.getByRole('link', { name: testReleaseTitle });
    await releaseLink.click();
    await page.getByRole('button', { name: /edit/i }).click();

    // Expand MP3 accordion item
    await page.getByText('MP3 320kbps').click();

    // Attempt to upload file with wrong MIME type
    const fileInput = page.getByLabel(/upload mp3/i);
    await fileInput.setInputFiles('e2e/fixtures/documents/fake-audio.txt'); // Text file renamed to .mp3

    // Verify error message
    const errorAlert = page.getByRole('alert');
    await expect(errorAlert).toBeVisible({ timeout: 5000 });
    await expect(errorAlert).toContainText(/invalid|mime type|file type/i);
  });

  test('should show loading state during upload process', async ({ page }) => {
    // Navigate to release edit page
    await page.goto('/admin/releases');
    const releaseLink = page.getByRole('link', { name: testReleaseTitle });
    await releaseLink.click();
    await page.getByRole('button', { name: /edit/i }).click();

    // Expand WAV accordion item
    await page.getByText('WAV').click();

    // Upload large WAV file
    const fileInput = page.getByLabel(/upload wav/i);
    await fileInput.setInputFiles('e2e/fixtures/audio/large-album.wav');

    // Verify loading indicator appears immediately
    await expect(page.getByText(/uploading/i)).toBeVisible({ timeout: 2000 });

    // Verify file input is disabled during upload
    await expect(fileInput).toBeDisabled();

    // Wait for completion
    await expect(page.getByText(/uploading/i)).toBeHidden({ timeout: 30000 });
  });

  test('should persist checkmark after page reload', async ({ page }) => {
    // Navigate to release edit page
    await page.goto('/admin/releases');
    const releaseLink = page.getByRole('link', { name: testReleaseTitle });
    await releaseLink.click();
    await page.getByRole('button', { name: /edit/i }).click();

    // Upload MP3 file
    await page.getByText('MP3 320kbps').click();
    const fileInput = page.getByLabel(/upload mp3/i);
    await fileInput.setInputFiles('e2e/fixtures/audio/sample-album.mp3');

    // Wait for upload to complete
    await expect(page.getByTestId('format-uploaded-checkmark')).toBeVisible({
      timeout: 15000,
    });

    // Reload page
    await page.reload();

    // Navigate back to edit page
    await page.getByRole('button', { name: /edit/i }).click();

    // Verify checkmark still appears (format was saved)
    const checkmark = page.getByTestId('format-uploaded-checkmark');
    await expect(checkmark).toBeVisible({ timeout: 5000 });
  });

  test('should upload multiple formats for same release', async ({ page }) => {
    // Navigate to release edit page
    await page.goto('/admin/releases');
    const releaseLink = page.getByRole('link', { name: testReleaseTitle });
    await releaseLink.click();
    await page.getByRole('button', { name: /edit/i }).click();

    // Upload MP3
    await page.getByText('MP3 320kbps').click();
    await page.getByLabel(/upload mp3/i).setInputFiles('e2e/fixtures/audio/sample-album.mp3');
    await expect(page.getByText(/uploading/i)).toBeHidden({ timeout: 15000 });

    // Upload FLAC
    await page.getByText('FLAC').click();
    await page.getByLabel(/upload flac/i).setInputFiles('e2e/fixtures/audio/sample-album.flac');
    await expect(page.getByText(/uploading/i)).toBeHidden({ timeout: 15000 });

    // Upload WAV
    await page.getByText('WAV').click();
    await page.getByLabel(/upload wav/i).setInputFiles('e2e/fixtures/audio/sample-album.wav');
    await expect(page.getByText(/uploading/i)).toBeHidden({ timeout: 20000 });

    // Verify all three checkmarks appear
    const checkmarks = page.getByTestId('format-uploaded-checkmark');
    await expect(checkmarks).toHaveCount(3);
  });

  test('should be keyboard accessible', async ({ page }) => {
    // Navigate to release edit page
    await page.goto('/admin/releases');
    const releaseLink = page.getByRole('link', { name: testReleaseTitle });
    await releaseLink.click();
    await page.getByRole('button', { name: /edit/i }).click();

    // Tab to MP3 accordion trigger
    await page.keyboard.press('Tab');
    await page.keyboard.press('Tab'); // Adjust based on actual tab order

    // Press Enter to expand
    await page.keyboard.press('Enter');

    // Verify file input is visible
    await expect(page.getByLabel(/upload mp3/i)).toBeVisible();

    // Tab to file input
    await page.keyboard.press('Tab');

    // Verify file input has focus
    const fileInput = page.getByLabel(/upload mp3/i);
    await expect(fileInput).toBeFocused();
  });
});
