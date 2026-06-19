/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { expect, test } from '../fixtures/base.fixture';

import type { Page } from '@playwright/test';

/**
 * Open the edit page for "E2E Album One" from the releases list. The list is the
 * searchable DataView, so filter by title and follow the matching Edit link
 * (the title is plain text here, not a named link).
 */
const openE2EAlbumOneEdit = async (adminPage: Page): Promise<void> => {
  await adminPage.goto('/admin/releases');
  await adminPage.getByPlaceholder(/search releases/i).fill('E2E Album One');
  // Scope to the card for this exact title — search may also surface the other
  // "E2E Album" releases, which have different format counts.
  const card = adminPage.locator('li').filter({ hasText: 'E2E Album One' });
  const editLink = card.getByRole('link', { name: /edit/i }).first();
  await expect(editLink).toBeVisible({ timeout: 15_000 });
  await editLink.click();
  await expect(adminPage).toHaveURL(/\/admin\/releases\/[a-f0-9]{24}$/);
};

test.describe('Admin Digital Formats Accordion', () => {
  test('displays digital formats accordion on release edit page', async ({ adminPage }) => {
    await openE2EAlbumOneEdit(adminPage);

    // Verify the digital formats card is present
    await expect(adminPage.getByText('Digital Formats')).toBeVisible();

    // Verify the description text for the upload section
    await expect(
      adminPage.getByText('Upload audio files in various formats for user downloads')
    ).toBeVisible();
  });

  test('shows checkmark indicators for uploaded formats', async ({ adminPage }) => {
    await openE2EAlbumOneEdit(adminPage);

    // Wait for the formats card to render (signals the release detail view is hydrated)
    await expect(adminPage.getByText('Digital Formats')).toBeVisible({ timeout: 15_000 });

    // E2E Album One has MP3_320KBPS, AAC, FLAC, and WAV seeded — should show 4 checkmarks
    const checkmarks = adminPage.getByTestId('format-uploaded-checkmark');
    await expect(checkmarks.first()).toBeVisible({ timeout: 15_000 });

    await expect(checkmarks).toHaveCount(4);
  });

  test('shows format badge count in accordion header', async ({ adminPage }) => {
    await openE2EAlbumOneEdit(adminPage);

    // Wait for the formats card to render before asserting the badge
    await expect(adminPage.getByText('Digital Formats')).toBeVisible({ timeout: 15_000 });

    // Should show a badge like "4 formats uploaded" (MP3 320kbps, AAC, FLAC, WAV)
    await expect(adminPage.getByText(/4 formats uploaded/)).toBeVisible({ timeout: 15_000 });
  });

  test('can expand accordion item to see format details', async ({ adminPage }) => {
    await openE2EAlbumOneEdit(adminPage);

    // Expand the MP3 320kbps accordion item
    const mp3Trigger = adminPage.getByRole('button', { name: /MP3 320kbps/ });
    await mp3Trigger.click();

    // Should show the "Re-upload files" button (since files already exist)
    await expect(adminPage.getByRole('button', { name: 'Re-upload files' })).toBeVisible();
  });

  test('displays all 8 format types in accordion', async ({ adminPage }) => {
    await openE2EAlbumOneEdit(adminPage);

    // All 8 format accordion triggers should be present
    const formats = ['MP3 320kbps', 'MP3 V0', 'AAC', 'Ogg Vorbis', 'FLAC', 'ALAC', 'WAV', 'AIFF'];

    for (const format of formats) {
      await expect(adminPage.getByRole('button', { name: format })).toBeVisible();
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
