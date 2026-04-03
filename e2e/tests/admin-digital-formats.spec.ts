/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { expect, test } from '../fixtures/base.fixture';

test.describe('Admin Digital Formats Accordion', () => {
  test('displays digital formats accordion on release edit page', async ({ adminPage }) => {
    // Navigate to admin releases list
    await adminPage.goto('/admin/releases');
    await expect(adminPage.getByRole('heading', { name: 'Releases' })).toBeVisible();

    // Click on E2E Album One (has MP3, FLAC, WAV formats seeded)
    await adminPage.getByRole('link', { name: 'E2E Album One' }).click();

    // Verify the digital formats card is present
    await expect(adminPage.getByText('Digital Formats')).toBeVisible();

    // Verify the description text for the upload section
    await expect(
      adminPage.getByText('Upload audio files in various formats for user downloads')
    ).toBeVisible();
  });

  test('shows checkmark indicators for uploaded formats', async ({ adminPage }) => {
    await adminPage.goto('/admin/releases');
    await adminPage.getByRole('link', { name: 'E2E Album One' }).click();

    // E2E Album One has MP3_320KBPS, FLAC, and WAV seeded — should show 3 checkmarks
    const checkmarks = adminPage.getByTestId('format-uploaded-checkmark');
    await expect(checkmarks.first()).toBeVisible({ timeout: 10_000 });

    const count = await checkmarks.count();
    expect(count).toBe(3);
  });

  test('shows format badge count in accordion header', async ({ adminPage }) => {
    await adminPage.goto('/admin/releases');
    await adminPage.getByRole('link', { name: 'E2E Album One' }).click();

    // Should show a badge like "3 formats uploaded"
    await expect(adminPage.getByText(/3 formats uploaded/)).toBeVisible({ timeout: 10_000 });
  });

  test('can expand accordion item to see format details', async ({ adminPage }) => {
    await adminPage.goto('/admin/releases');
    await adminPage.getByRole('link', { name: 'E2E Album One' }).click();

    // Expand the MP3 320kbps accordion item
    const mp3Trigger = adminPage.getByRole('button', { name: /MP3 320kbps/ });
    await mp3Trigger.click();

    // Should show the "Re-upload files" button (since files already exist)
    await expect(adminPage.getByRole('button', { name: 'Re-upload files' })).toBeVisible();
  });

  test('displays all 8 format types in accordion', async ({ adminPage }) => {
    await adminPage.goto('/admin/releases');
    await adminPage.getByRole('link', { name: 'E2E Album One' }).click();

    // All 8 format accordion triggers should be present
    const formats = ['MP3 320kbps', 'MP3 V0', 'AAC', 'Ogg Vorbis', 'FLAC', 'ALAC', 'WAV', 'AIFF'];

    for (const format of formats) {
      await expect(adminPage.getByRole('button', { name: new RegExp(format) })).toBeVisible();
    }
  });

  test('create release page shows locked state until MP3 uploaded', async ({ adminPage }) => {
    await adminPage.goto('/admin/releases/new');

    // CardDescription should show the locked message about uploading MP3 first
    await expect(
      adminPage.getByText(
        'Upload MP3 320kbps first — the release will be created automatically from the audio metadata.'
      )
    ).toBeVisible();
  });
});
