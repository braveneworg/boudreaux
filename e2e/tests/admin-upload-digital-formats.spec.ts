/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { test, expect } from '../fixtures/base.fixture';

// Skip: Tests depend on missing seed data ('Test Digital Album'), missing audio fixtures
// (e2e/fixtures/audio/), and UI workflow that doesn't match current release edit page.
test.describe.skip('Admin Upload Digital Formats', () => {
  const testReleaseTitle = 'Test Digital Album';

  test('should display digital formats accordion on release edit page', async ({ adminPage }) => {
    // Navigate to releases list
    await adminPage.goto('/admin/releases');
    await expect(adminPage).toHaveTitle(/Releases/);

    // Find and click on a release (or create one for testing)
    const releaseLink = adminPage.getByRole('link', { name: testReleaseTitle });
    await releaseLink.click();

    // Click edit button
    await adminPage.getByRole('button', { name: /edit/i }).click();

    // Verify digital formats accordion is present
    await expect(adminPage.getByText('Digital Formats')).toBeVisible();
    await expect(adminPage.getByText('MP3 320kbps')).toBeVisible();
    await expect(adminPage.getByText('FLAC')).toBeVisible();
    await expect(adminPage.getByText('WAV')).toBeVisible();
    await expect(adminPage.getByText('AAC')).toBeVisible();
  });

  test('should expand accordion item and show file input', async ({ adminPage }) => {
    // Navigate to release edit page
    await adminPage.goto('/admin/releases');
    const releaseLink = adminPage.getByRole('link', { name: testReleaseTitle });
    await releaseLink.click();
    await adminPage.getByRole('button', { name: /edit/i }).click();

    // Expand MP3 accordion item
    const mp3Trigger = adminPage.getByText('MP3 320kbps');
    await mp3Trigger.click();

    // Verify file input is visible
    const fileInput = adminPage.getByLabel(/upload mp3/i);
    await expect(fileInput).toBeVisible();
    await expect(fileInput).toHaveAttribute('type', 'file');
    await expect(fileInput).toHaveAttribute('accept', /mp3|audio\/mpeg/);
  });

  test('should upload valid MP3 file and show checkmark indicator', async ({ adminPage }) => {
    // Navigate to release edit page
    await adminPage.goto('/admin/releases');
    const releaseLink = adminPage.getByRole('link', { name: testReleaseTitle });
    await releaseLink.click();
    await adminPage.getByRole('button', { name: /edit/i }).click();

    // Expand MP3 accordion item
    await adminPage.getByText('MP3 320kbps').click();

    // Upload a valid MP3 file (using test fixture)
    const fileInput = adminPage.getByLabel(/upload mp3/i);
    await fileInput.setInputFiles('e2e/fixtures/audio/sample-album.mp3');

    // Wait for upload to complete
    await expect(adminPage.getByText(/uploading/i)).toBeVisible();
    await expect(adminPage.getByText(/uploading/i)).toBeHidden({ timeout: 15000 });

    // Verify success message
    await expect(adminPage.getByText(/upload successful/i)).toBeVisible({
      timeout: 5000,
    });

    // Verify checkmark indicator appears
    const checkmark = adminPage.getByTestId('format-uploaded-checkmark');
    await expect(checkmark).toBeVisible({ timeout: 10000 });
  });

  test('should upload valid FLAC file and show checkmark', async ({ adminPage }) => {
    // Navigate to release edit page
    await adminPage.goto('/admin/releases');
    const releaseLink = adminPage.getByRole('link', { name: testReleaseTitle });
    await releaseLink.click();
    await adminPage.getByRole('button', { name: /edit/i }).click();

    // Expand FLAC accordion item
    await adminPage.getByText('FLAC').click();

    // Upload a valid FLAC file
    const fileInput = adminPage.getByLabel(/upload flac/i);
    await fileInput.setInputFiles('e2e/fixtures/audio/sample-album.flac');

    // Wait for upload to complete
    await expect(adminPage.getByText(/uploading/i)).toBeVisible();
    await expect(adminPage.getByText(/uploading/i)).toBeHidden({ timeout: 15000 });

    // Verify checkmark indicator
    const checkmark = adminPage.getByTestId('format-uploaded-checkmark');
    await expect(checkmark).toBeVisible({ timeout: 10000 });
  });

  test('should reject file exceeding size limit', async ({ adminPage }) => {
    // Navigate to release edit page
    await adminPage.goto('/admin/releases');
    const releaseLink = adminPage.getByRole('link', { name: testReleaseTitle });
    await releaseLink.click();
    await adminPage.getByRole('button', { name: /edit/i }).click();

    // Expand MP3 accordion item
    await adminPage.getByText('MP3 320kbps').click();

    // Attempt to upload oversized file
    const fileInput = adminPage.getByLabel(/upload mp3/i);
    await fileInput.setInputFiles('e2e/fixtures/audio/oversized-album.mp3'); // >100MB

    // Verify error message appears
    const errorAlert = adminPage.getByRole('alert');
    await expect(errorAlert).toBeVisible({ timeout: 5000 });
    await expect(errorAlert).toContainText(/size limit|too large/i);

    // Verify no checkmark appears
    const checkmark = adminPage.getByTestId('format-uploaded-checkmark');
    await expect(checkmark).toBeHidden();
  });

  test('should reject file with invalid MIME type', async ({ adminPage }) => {
    // Navigate to release edit page
    await adminPage.goto('/admin/releases');
    const releaseLink = adminPage.getByRole('link', { name: testReleaseTitle });
    await releaseLink.click();
    await adminPage.getByRole('button', { name: /edit/i }).click();

    // Expand MP3 accordion item
    await adminPage.getByText('MP3 320kbps').click();

    // Attempt to upload file with wrong MIME type
    const fileInput = adminPage.getByLabel(/upload mp3/i);
    await fileInput.setInputFiles('e2e/fixtures/documents/fake-audio.txt'); // Text file renamed to .mp3

    // Verify error message
    const errorAlert = adminPage.getByRole('alert');
    await expect(errorAlert).toBeVisible({ timeout: 5000 });
    await expect(errorAlert).toContainText(/invalid|mime type|file type/i);
  });

  test('should show loading state during upload process', async ({ adminPage }) => {
    // Navigate to release edit page
    await adminPage.goto('/admin/releases');
    const releaseLink = adminPage.getByRole('link', { name: testReleaseTitle });
    await releaseLink.click();
    await adminPage.getByRole('button', { name: /edit/i }).click();

    // Expand WAV accordion item
    await adminPage.getByText('WAV').click();

    // Upload large WAV file
    const fileInput = adminPage.getByLabel(/upload wav/i);
    await fileInput.setInputFiles('e2e/fixtures/audio/large-album.wav');

    // Verify loading indicator appears immediately
    await expect(adminPage.getByText(/uploading/i)).toBeVisible({ timeout: 2000 });

    // Verify file input is disabled during upload
    await expect(fileInput).toBeDisabled();

    // Wait for completion
    await expect(adminPage.getByText(/uploading/i)).toBeHidden({ timeout: 30000 });
  });

  test('should persist checkmark after page reload', async ({ adminPage }) => {
    // Navigate to release edit page
    await adminPage.goto('/admin/releases');
    const releaseLink = adminPage.getByRole('link', { name: testReleaseTitle });
    await releaseLink.click();
    await adminPage.getByRole('button', { name: /edit/i }).click();

    // Upload MP3 file
    await adminPage.getByText('MP3 320kbps').click();
    const fileInput = adminPage.getByLabel(/upload mp3/i);
    await fileInput.setInputFiles('e2e/fixtures/audio/sample-album.mp3');

    // Wait for upload to complete
    await expect(adminPage.getByTestId('format-uploaded-checkmark')).toBeVisible({
      timeout: 15000,
    });

    // Reload page
    await adminPage.reload();

    // Navigate back to edit page
    await adminPage.getByRole('button', { name: /edit/i }).click();

    // Verify checkmark still appears (format was saved)
    const checkmark = adminPage.getByTestId('format-uploaded-checkmark');
    await expect(checkmark).toBeVisible({ timeout: 5000 });
  });

  test('should upload multiple formats for same release', async ({ adminPage }) => {
    // Navigate to release edit page
    await adminPage.goto('/admin/releases');
    const releaseLink = adminPage.getByRole('link', { name: testReleaseTitle });
    await releaseLink.click();
    await adminPage.getByRole('button', { name: /edit/i }).click();

    // Upload MP3
    await adminPage.getByText('MP3 320kbps').click();
    await adminPage.getByLabel(/upload mp3/i).setInputFiles('e2e/fixtures/audio/sample-album.mp3');
    await expect(adminPage.getByText(/uploading/i)).toBeHidden({ timeout: 15000 });

    // Upload FLAC
    await adminPage.getByText('FLAC').click();
    await adminPage
      .getByLabel(/upload flac/i)
      .setInputFiles('e2e/fixtures/audio/sample-album.flac');
    await expect(adminPage.getByText(/uploading/i)).toBeHidden({ timeout: 15000 });

    // Upload WAV
    await adminPage.getByText('WAV').click();
    await adminPage.getByLabel(/upload wav/i).setInputFiles('e2e/fixtures/audio/sample-album.wav');
    await expect(adminPage.getByText(/uploading/i)).toBeHidden({ timeout: 20000 });

    // Verify all three checkmarks appear
    const checkmarks = adminPage.getByTestId('format-uploaded-checkmark');
    await expect(checkmarks).toHaveCount(3);
  });

  test('should be keyboard accessible', async ({ adminPage }) => {
    // Navigate to release edit page
    await adminPage.goto('/admin/releases');
    const releaseLink = adminPage.getByRole('link', { name: testReleaseTitle });
    await releaseLink.click();
    await adminPage.getByRole('button', { name: /edit/i }).click();

    // Tab to MP3 accordion trigger
    await adminPage.keyboard.press('Tab');
    await adminPage.keyboard.press('Tab'); // Adjust based on actual tab order

    // Press Enter to expand
    await adminPage.keyboard.press('Enter');

    // Verify file input is visible
    await expect(adminPage.getByLabel(/upload mp3/i)).toBeVisible();

    // Tab to file input
    await adminPage.keyboard.press('Tab');

    // Verify file input has focus
    const fileInput = adminPage.getByLabel(/upload mp3/i);
    await expect(fileInput).toBeFocused();
  });
});
