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

    // Guard against transient hydration doubles before asserting visibility.
    const tile = adminPage.getByText(doomedLabel);
    await expect(tile).toHaveCount(1, { timeout: 15_000 });
    await expect(tile).toBeVisible();

    await adminPage.getByRole('button', { name: `Delete link ${doomedLabel}` }).click();
    await expect(adminPage.getByText(doomedLabel)).toHaveCount(0, { timeout: 15_000 });
  });

  test('inserted figure persists through save', async ({ adminPage }) => {
    await gotoArtistEdit(adminPage);

    // Unique attribution per run so a CI retry (which would insert a second
    // figure) can never trip Playwright's strict-mode duplicate matching.
    const attribution = `E2E figure ${randomUUID().slice(0, 8)}`;

    // The Bio editor renders first on the form, so its toolbar owns the first
    // Insert image button (Short Bio and Alternative Bio follow it). Guard the
    // full button count first so a transient hydration double (which would
    // briefly duplicate the editors) has settled before we click.
    // Use exact:true so the palette tiles' "Insert image E2E palette portrait"
    // buttons (partial matches) are excluded — only the 3 toolbar buttons count.
    const insertImageButtons = adminPage.getByRole('button', { name: 'Insert image', exact: true });
    await expect(insertImageButtons).toHaveCount(3, { timeout: 15_000 });
    const insertImage = insertImageButtons.first();
    await expect(insertImage).toBeVisible();
    await insertImage.click();

    await expect(
      adminPage.getByRole('dialog', { name: 'Insert image', exact: true })
    ).toBeVisible();
    await adminPage.getByLabel('Attribution', { exact: true }).fill(attribution);
    await adminPage.getByRole('button', { name: 'Insert E2E palette photo' }).click();

    // Same hydration-double guard on the editing surface before reading it.
    const bioEditor = adminPage.getByRole('textbox', { name: 'Bio', exact: true });
    await expect(bioEditor).toHaveCount(1, { timeout: 15_000 });
    await expect(bioEditor.getByText(attribution)).toBeVisible();

    const save = adminPage.getByRole('button', { name: 'Save', exact: true });
    await expect(save).toBeEnabled({ timeout: 10_000 });
    await save.click();
    await expect(adminPage.getByText(/saved successfully/i)).toBeVisible({ timeout: 15_000 });

    // In the E2E environment no CDN prefix is configured, so save-time
    // re-hosting is a no-op by design — the figure src persists unchanged.
    // Reload, wait out any hydration double, and assert the caption
    // round-tripped through the sanitizer.
    await adminPage.reload();
    await expect(bioEditor).toHaveCount(1, { timeout: 15_000 });
    await expect(bioEditor.getByText(attribution).first()).toBeVisible({ timeout: 15_000 });
  });

  test('BioLink NodeView click-to-edit dialog and remove', async ({ adminPage }) => {
    await gotoArtistEdit(adminPage);

    // The seeded bio carries <a href="https://en.wikipedia.org/wiki/Music">E2E bubble link</a>.
    // The BioLink TipTap extension parses every <a[href]> into an inline atom node
    // rendered by BioLinkNodeView — a <span> with `title={href}`, not an <a>. The
    // anchor text itself is the click-to-edit control; the dialog carries Remove.
    const bioEditor = adminPage.getByRole('textbox', { name: 'Bio', exact: true });
    await expect(bioEditor).toHaveCount(1, { timeout: 15_000 });

    // Locate the BioLink atom node by its unique title attribute (the href value).
    const bioLinkNode = bioEditor.locator('[title="https://en.wikipedia.org/wiki/Music"]');
    await expect(bioLinkNode).toBeVisible({ timeout: 15_000 });

    // Clicking the link text opens the edit dialog directly, prefilled with the href.
    await bioLinkNode.click();
    const dialog = adminPage.getByRole('dialog', { name: 'Insert link', exact: true });
    await expect(dialog).toBeVisible({ timeout: 10_000 });
    await expect(adminPage.getByLabel('URL', { exact: true })).toHaveValue(
      'https://en.wikipedia.org/wiki/Music'
    );

    // The dialog's Remove control deletes the BioLink atom entirely (text goes too).
    await dialog.getByRole('button', { name: 'Remove', exact: true }).click();
    await expect(dialog).toHaveCount(0);
    await expect(bioEditor.getByText('E2E bubble link')).toHaveCount(0);
  });
});
