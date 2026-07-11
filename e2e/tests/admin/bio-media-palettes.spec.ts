/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { expect, test } from '../../fixtures/auth.fixture';
import { BIO_FILTER_INSERT_ARTIST_ID } from '../../helpers/seed-test-db';

import type { Page } from '@playwright/test';

/**
 * E2E coverage for the bio media palette filter, click-to-insert (touch /
 * keyboard path), and persistence flows. Uses a dedicated seeded artist with
 * no initial bioStatus so the palettes do not render on page load; the test
 * triggers generation to get the deterministic fixture rows (Wikipedia link,
 * press link "An interview with the artist", photo image, cover image
 * "Fixture Album"). No releases are linked to this artist so the fixture
 * produces exactly 2 links and 2 images — counts are stable across retries.
 *
 * Drag-and-drop insertion is intentionally not covered here: synthetic
 * DataTransfer drags over ProseMirror drop coordinates are not reliably
 * reproducible in Playwright; the drop handler is fully unit-covered in
 * `src/app/components/ui/bio-editor-drop.spec.ts`.
 */

const gotoFilterInsertArtistEdit = async (adminPage: Page): Promise<void> => {
  await adminPage.goto(`/admin/artists/${BIO_FILTER_INSERT_ARTIST_ID}`);
  await expect(adminPage.getByRole('heading', { name: 'Edit Artist', exact: true })).toBeVisible({
    timeout: 15_000,
  });
};

test.describe('Admin bio media palettes', () => {
  test('palettes support filter, click-to-insert, and persistence', async ({ adminPage }) => {
    await gotoFilterInsertArtistEdit(adminPage);

    // 1. Trigger Generate bios and await status success (Regenerate button visible).
    const generate = adminPage.getByRole('button', { name: /generate bios/i });
    await expect(generate).toBeVisible({ timeout: 15_000 });
    await generate.click();

    // Generation runs in the background via server `after()`; the client polls
    // for completion. Allow up to 30 s for the fixture to complete and the
    // palettes to appear. The "Regenerate bios" button is the reliable success
    // indicator — it only appears once bioStatus flips to 'succeeded'.
    const regenerate = adminPage.getByRole('button', { name: /regenerate bios/i });
    await expect(regenerate).toBeVisible({ timeout: 30_000 });

    // 2. Palette headings must be visible (counts include the opening paren
    //    so the assertion holds regardless of the exact count digit).
    const linksGroup = adminPage.getByRole('group', { name: 'Discovered links' });
    await expect(linksGroup).toHaveCount(1, { timeout: 15_000 });
    await expect(linksGroup).toBeVisible();
    await expect(linksGroup.getByText('Discovered links (', { exact: false })).toBeVisible();

    const imagesGroup = adminPage.getByRole('group', { name: 'Discovered images' });
    await expect(imagesGroup).toHaveCount(1, { timeout: 15_000 });
    await expect(imagesGroup).toBeVisible();
    await expect(imagesGroup.getByText('Discovered images (', { exact: false })).toBeVisible();

    // 3. Filter links by 'interview' → press link visible, Wikipedia filtered out.
    //    The filter matches label OR kind substring (case-insensitive), so
    //    "An interview with the artist" (label contains 'interview') passes and
    //    "Wikipedia" (neither label nor kind contains 'interview') is hidden.
    const filterLinks = adminPage.getByLabel('Filter links');
    await filterLinks.fill('interview');
    await expect(linksGroup.getByText('An interview with the artist')).toBeVisible();
    await expect(linksGroup.getByText('Wikipedia')).toHaveCount(0);

    // 4. Click-to-insert the press link into the Bio editor.
    //    Guard against transient hydration doubles before clicking the editor.
    const bioEditor = adminPage.getByRole('textbox', { name: 'Bio', exact: true });
    await expect(bioEditor).toHaveCount(1, { timeout: 15_000 });
    // Click the editor to make it the active insert target in the registry.
    await bioEditor.click();
    await adminPage
      .getByRole('button', { name: 'Insert link An interview with the artist' })
      .click();
    // The BioLink NodeView renders as an inline <span data-testid="bio-link-node">
    // in the editor. Asserting on the NodeView wrapper (not just the text)
    // proves the atom node was inserted rather than raw text.
    await expect(
      bioEditor.locator('[data-testid="bio-link-node"]').filter({
        hasText: 'An interview with the artist',
      })
    ).toHaveCount(1);

    // 5. Click-to-insert the cover image ("Fixture Album") into the Bio editor.
    //    The image palette is independent of the link filter — no need to clear it.
    //    The BioFigure NodeView renders a plain <img> (not next/image); assert on
    //    the alt attribute surfaced from the fixture ("Fixture Album cover art").
    await adminPage.getByRole('button', { name: 'Insert image Fixture Album' }).click();
    await expect(bioEditor.locator('img[alt="Fixture Album cover art"]')).toBeVisible();

    // 6. Save the artist and reload to verify that the inserted bio link and
    //    figure survived the sanitizer round-trip and are re-parsed from HTML.
    const save = adminPage.getByRole('button', { name: 'Save', exact: true });
    await expect(save).toBeEnabled({ timeout: 10_000 });
    await save.click();
    await expect(adminPage.getByText(/saved successfully/i)).toBeVisible({ timeout: 15_000 });

    await adminPage.reload();
    // Wait out any transient hydration doubles on the editor before reading it.
    await expect(bioEditor).toHaveCount(1, { timeout: 15_000 });
    // Assert the NodeView wrapper (not just text) to confirm the bioLink atom
    // was correctly round-tripped through the sanitizer and re-parsed.
    await expect(
      bioEditor.locator('[data-testid="bio-link-node"]').filter({
        hasText: 'An interview with the artist',
      })
    ).toHaveCount(1, { timeout: 15_000 });
    await expect(bioEditor.locator('img[alt="Fixture Album cover art"]')).toBeVisible({
      timeout: 15_000,
    });

    // 7. Cover badge visible on the cover tile; eye preview dialog still opens.
    //    The palette re-renders from the persisted rows (bioStatus 'succeeded' is
    //    unchanged by saving the bio form). The cover image has kind='cover' which
    //    renders as an overlay Badge. The eye button opens a preview dialog whose
    //    accessible name matches the image title ("Fixture Album").
    //    Use exact:true so "Discovered" (which contains "cover" as a substring)
    //    and "Cover Art Archive" are not matched — only the badge text "cover".
    await expect(imagesGroup).toBeVisible({ timeout: 15_000 });
    await expect(imagesGroup.getByText('cover', { exact: true })).toBeVisible();
    await adminPage.getByRole('button', { name: 'Preview Fixture Album' }).click();
    const previewDialog = adminPage.getByRole('dialog', { name: 'Fixture Album' });
    await expect(previewDialog).toBeVisible();

    // Close the preview dialog before the license assertions: while a Radix
    // Dialog is open it marks the rest of the page aria-hidden, which would hide
    // the palette tiles from role-based queries below.
    await adminPage.keyboard.press('Escape');
    await expect(previewDialog).toBeHidden();

    // 8. License provenance per tile (tile-scoped so a hidden/other tile's badge
    //    cannot poison the assertion). The fixture portrait carries a license
    //    with a machine-readable licenseUrl (→ linked badge); the cover carries
    //    no license (→ muted "Rights unknown").
    const portraitTile = imagesGroup.locator('li').filter({
      has: adminPage.getByRole('button', { name: 'Delete image E2E Bio Media Artist portrait' }),
    });
    const licenseLink = portraitTile.getByRole('link', { name: /Public domain/ });
    await expect(licenseLink).toBeVisible();
    await expect(licenseLink).toHaveAttribute(
      'href',
      'https://creativecommons.org/publicdomain/mark/1.0/'
    );

    const coverTile = imagesGroup.locator('li').filter({
      has: adminPage.getByRole('button', { name: 'Delete image Fixture Album' }),
    });
    await expect(coverTile.getByText('Rights unknown')).toBeVisible();
  });
});
