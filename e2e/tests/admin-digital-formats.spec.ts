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

    // Wait for the formats card to render (signals the release detail view is hydrated)
    await expect(adminPage.getByText('Digital Formats')).toBeVisible({ timeout: 15_000 });

    // E2E Album One has MP3_320KBPS, AAC, FLAC, and WAV seeded — should show 4 checkmarks
    const checkmarks = adminPage.getByTestId('format-uploaded-checkmark');
    await expect(checkmarks.first()).toBeVisible({ timeout: 15_000 });

    await expect(checkmarks).toHaveCount(4);
  });

  test('shows format badge count in accordion header', async ({ adminPage }) => {
    await adminPage.goto('/admin/releases');
    await adminPage.getByRole('link', { name: 'E2E Album One' }).click();

    // Wait for the formats card to render before asserting the badge
    await expect(adminPage.getByText('Digital Formats')).toBeVisible({ timeout: 15_000 });

    // Should show a badge like "4 formats uploaded" (MP3 320kbps, AAC, FLAC, WAV)
    await expect(adminPage.getByText(/4 formats uploaded/)).toBeVisible({ timeout: 15_000 });
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

    // CardDescription shows the locked message about uploading MP3 first. The
    // release form is a client component; under load its initial hydration can
    // briefly mount a second copy of the card before settling to one. Assert
    // the match count settles to 1 before checking visibility, so the transient
    // duplicate can't trip a strict-mode violation (toBeVisible throws on >1).
    const lockedMessage = adminPage.getByText(
      'Upload MP3 320kbps first — the release will be created automatically from the audio metadata.'
    );
    await expect(lockedMessage).toHaveCount(1);
    await expect(lockedMessage).toBeVisible();
  });
});
