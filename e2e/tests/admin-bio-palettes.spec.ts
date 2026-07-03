/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { randomUUID } from 'node:crypto';

import { expect, test } from '../fixtures/auth.fixture';
import { BIO_PALETTE_ARTIST_ID, createBioPaletteLinkRow } from '../helpers/seed-test-db';

import type { Page } from '@playwright/test';

/**
 * E2E coverage for the admin bio link/image palettes and the bio editor's
 * figure + link flows, against the dedicated seeded palette artist
 * (bioStatus 'succeeded' with persisted ArtistBioLink/ArtistBioImage rows).
 *
 * Palette-tile → editor drag-and-drop is intentionally NOT covered here:
 * synthetic DataTransfer drags over ProseMirror drop coordinates are not
 * reliably reproducible in Playwright, and the drop handler is fully
 * unit-covered in `src/app/components/ui/bio-editor-drop.spec.ts`.
 */

const gotoArtistEdit = async (adminPage: Page): Promise<void> => {
  await adminPage.goto(`/admin/artists/${BIO_PALETTE_ARTIST_ID}`);
  await expect(adminPage.getByRole('heading', { name: 'Edit Artist', exact: true })).toBeVisible({
    timeout: 15_000,
  });
};

test.describe('Admin bio palettes', () => {
  test('bio palettes render the persisted rows', async ({ adminPage }) => {
    await gotoArtistEdit(adminPage);

    // Guard against transient hydration doubles before asserting visibility.
    const linksGroup = adminPage.getByRole('group', { name: 'Discovered links' });
    await expect(linksGroup).toHaveCount(1, { timeout: 15_000 });
    await expect(linksGroup).toBeVisible();
    await expect(linksGroup.getByText('E2E Wikipedia')).toBeVisible();

    const imagesGroup = adminPage.getByRole('group', { name: 'Discovered images' });
    await expect(imagesGroup).toHaveCount(1);
    await expect(imagesGroup).toBeVisible();
    await expect(imagesGroup.getByText('E2E seeded attribution')).toBeVisible();
  });

  test('deleting a palette link removes the tile', async ({ adminPage }) => {
    // A uniquely-labelled row per run (and per retry) keeps this destructive
    // test from racing the shared seeded rows other tests assert on.
    const doomedLabel = `E2E Doomed ${randomUUID().slice(0, 8)}`;
    await createBioPaletteLinkRow(doomedLabel);

    await gotoArtistEdit(adminPage);

    const tile = adminPage.getByText(doomedLabel);
    await expect(tile).toBeVisible({ timeout: 15_000 });

    await adminPage.getByRole('button', { name: `Delete link ${doomedLabel}` }).click();
    await expect(adminPage.getByText(doomedLabel)).toHaveCount(0, { timeout: 15_000 });
  });

  test('inserted figure persists through save', async ({ adminPage }) => {
    await gotoArtistEdit(adminPage);

    // Unique attribution per run so a CI retry (which would insert a second
    // figure) can never trip Playwright's strict-mode duplicate matching.
    const attribution = `E2E figure ${randomUUID().slice(0, 8)}`;

    // The Bio editor renders first on the form, so its toolbar owns the first
    // Insert image button (Short Bio and Alternative Bio follow it).
    const insertImage = adminPage.getByRole('button', { name: 'Insert image' }).first();
    await expect(insertImage).toBeVisible({ timeout: 15_000 });
    await insertImage.click();

    await expect(
      adminPage.getByRole('dialog', { name: 'Insert image', exact: true })
    ).toBeVisible();
    await adminPage.getByLabel('Attribution', { exact: true }).fill(attribution);
    await adminPage.getByRole('button', { name: 'Insert E2E palette photo' }).click();

    const bioEditor = adminPage.getByRole('textbox', { name: 'Bio', exact: true });
    await expect(bioEditor.getByText(attribution)).toBeVisible();

    const save = adminPage.getByRole('button', { name: 'Save', exact: true });
    await expect(save).toBeEnabled({ timeout: 10_000 });
    await save.click();
    await expect(adminPage.getByText(/saved successfully/i)).toBeVisible({ timeout: 15_000 });

    // In the E2E environment no CDN prefix is configured, so save-time
    // re-hosting is a no-op by design — the figure src persists unchanged.
    // Reload and assert the caption round-tripped through the sanitizer.
    await adminPage.reload();
    await expect(bioEditor.getByText(attribution).first()).toBeVisible({ timeout: 15_000 });
  });

  test('link bubble menu edits and unlinks an existing link', async ({ adminPage }) => {
    await gotoArtistEdit(adminPage);

    const bioEditor = adminPage.getByRole('textbox', { name: 'Bio', exact: true });
    const seededLink = bioEditor.getByRole('link', { name: 'E2E bubble link' });
    await expect(seededLink).toBeVisible({ timeout: 15_000 });

    // Clicking into the link text places the caret inside the link mark, which
    // makes the floating bubble menu appear.
    await seededLink.click();
    const editButton = adminPage.getByRole('button', { name: 'Edit', exact: true });
    await expect(editButton).toBeVisible({ timeout: 10_000 });

    // Edit reopens the link dialog prefilled with the existing href.
    await editButton.click();
    await expect(adminPage.getByRole('dialog', { name: 'Insert link', exact: true })).toBeVisible();
    await expect(adminPage.getByLabel('URL', { exact: true })).toHaveValue(
      'https://en.wikipedia.org/wiki/Music'
    );
    await adminPage.keyboard.press('Escape');
    await expect(adminPage.getByRole('dialog', { name: 'Insert link', exact: true })).toHaveCount(
      0
    );

    // Unlink removes the link mark but keeps the text.
    await seededLink.click();
    const unlinkButton = adminPage.getByRole('button', { name: 'Unlink', exact: true });
    await expect(unlinkButton).toBeVisible({ timeout: 10_000 });
    await unlinkButton.click();

    await expect(bioEditor.getByRole('link')).toHaveCount(0);
    await expect(bioEditor.getByText('E2E bubble link')).toBeVisible();
  });
});
