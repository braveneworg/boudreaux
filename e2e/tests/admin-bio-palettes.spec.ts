/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { randomUUID } from 'node:crypto';

import { expect, test } from '../fixtures/auth.fixture';
import {
  BIO_PALETTE_ARTIST_ID,
  createBioPaletteImageRow,
  createBioPaletteLinkRow,
} from '../helpers/seed-test-db';

import type { Page } from '@playwright/test';

/**
 * E2E coverage for the admin bio link palette, the bio image manager (pool,
 * display images), and the bio editor's figure + link flows, against the
 * dedicated seeded palette artist (bioStatus 'succeeded' with persisted
 * ArtistBioLink/ArtistBioImage rows).
 *
 * Tile → editor drag-and-drop is intentionally NOT covered here: synthetic
 * DataTransfer drags over ProseMirror drop coordinates are not reliably
 * reproducible in Playwright, and the drop handler is fully unit-covered in
 * `src/app/components/ui/bio-editor-drop.spec.ts`.
 */

const gotoArtistEdit = async (adminPage: Page): Promise<void> => {
  await adminPage.goto(`/admin/artists/${BIO_PALETTE_ARTIST_ID}`);
  await expect(adminPage.getByRole('heading', { name: 'Edit Artist', exact: true })).toBeVisible({
    timeout: 15_000,
  });
};

/** The manager's only data source; nginx's api zone throttles it under rapid admin navigation. */
const STATUS_ROUTE = '**/api/artists/*/bio-generation';

/** What nginx returns when the api zone's burst is spent (`limit_req_status 429`). */
const THROTTLED_RESPONSE = {
  status: 429,
  headers: { 'retry-after': '1' },
  contentType: 'text/plain',
  body: 'Too Many Requests',
};

test.describe('Admin bio palettes', () => {
  // nginx's api zone once 429'd the status read during rapid admin navigation
  // and the manager showed "Image pool (0)" for an artist with 36 images
  // (2026-09-21). The client now backs off and retries; a transient 429 must
  // recover without any admin action.
  //
  // Two throttled GETs, not one: the dev server's React StrictMode remount
  // cancels the very first fetch, so a single 429 would be swallowed by the
  // cancellation and the retry policy would never run locally. Two stays
  // inside the policy's retry budget on CI's production build as well.
  test('recovers the image pool after transient 429s on the status read', async ({ adminPage }) => {
    const THROTTLED_GETS = 2;
    let throttledGets = 0;
    await adminPage.route(STATUS_ROUTE, async (route) => {
      if (route.request().method() === 'GET' && throttledGets < THROTTLED_GETS) {
        throttledGets += 1;
        await route.fulfill(THROTTLED_RESPONSE);
        return;
      }
      await route.continue();
    });

    await gotoArtistEdit(adminPage);

    const manager = adminPage.getByRole('region', { name: 'Bio images' });
    await expect(manager).toHaveCount(1, { timeout: 15_000 });
    const pool = manager.getByRole('group', { name: 'Image pool' });
    await expect(pool.getByText('E2E seeded attribution')).toBeVisible({ timeout: 15_000 });
    await expect(manager.getByRole('alert')).toHaveCount(0);
    expect(throttledGets).toBe(THROTTLED_GETS);
  });

  test('shows a retry alert when the status read keeps failing, and Retry recovers', async ({
    adminPage,
  }) => {
    await adminPage.route(STATUS_ROUTE, async (route) => {
      if (route.request().method() === 'GET') {
        await route.fulfill(THROTTLED_RESPONSE);
        return;
      }
      await route.continue();
    });

    await gotoArtistEdit(adminPage);

    const manager = adminPage.getByRole('region', { name: 'Bio images' });
    await expect(manager).toHaveCount(1, { timeout: 15_000 });
    // Two backed-off retries (Retry-After: 1 s each) precede the settled failure.
    const alert = manager.getByRole('alert');
    await expect(alert).toBeVisible({ timeout: 15_000 });
    await expect(alert).toContainText('rate limiting');
    await expect(manager.getByText('No images yet')).toHaveCount(0);

    await adminPage.unroute(STATUS_ROUTE);
    await alert.getByRole('button', { name: 'Retry' }).click();

    const pool = manager.getByRole('group', { name: 'Image pool' });
    await expect(pool.getByText('E2E seeded attribution')).toBeVisible({ timeout: 15_000 });
    await expect(manager.getByRole('alert')).toHaveCount(0);
  });

  test('bio palettes render the persisted rows', async ({ adminPage }) => {
    await gotoArtistEdit(adminPage);

    // Guard against transient hydration doubles before asserting visibility.
    const linksGroup = adminPage.getByRole('group', { name: 'Discovered links' });
    await expect(linksGroup).toHaveCount(1, { timeout: 15_000 });
    await expect(linksGroup).toBeVisible();
    await expect(linksGroup.getByText('E2E Wikipedia')).toBeVisible();

    const manager = adminPage.getByRole('region', { name: 'Bio images' });
    await expect(manager).toHaveCount(1);
    await expect(manager).toBeVisible();
    const pool = manager.getByRole('group', { name: 'Image pool' });
    await expect(pool.getByText('E2E seeded attribution')).toBeVisible();
  });

  test('an image without alt text cannot be chosen as a display image', async ({ adminPage }) => {
    await gotoArtistEdit(adminPage);

    // The seeded portrait carries no alt text, so the service would refuse
    // it; the manager disables the affordance up front and says why.
    const use = adminPage.getByRole('button', {
      name: 'Use E2E palette portrait as display image',
    });
    await expect(use).toHaveCount(1, { timeout: 15_000 });
    await expect(use).toBeDisabled();
    await expect(use).toHaveAccessibleDescription(/alt text/i);
  });

  // #767: with nothing chosen the page falls back to suggested, then pool
  // images — but only ones with alt text (ADR-0008 addendum). The seeded
  // portrait is suggested and has no alt, so the page must skip it, and the
  // manager marks only what the page shows. Holds whether or not a concurrent
  // test has chosen an image: a chosen tier marks nothing as Shown either.
  test('the suggested portrait without alt text is not marked as shown', async ({ adminPage }) => {
    await gotoArtistEdit(adminPage);

    const pool = adminPage.getByRole('group', { name: 'Image pool' });
    const portrait = pool.getByRole('listitem').filter({
      has: adminPage.getByRole('button', { name: 'Preview E2E palette portrait', exact: true }),
    });
    await expect(portrait).toHaveCount(1, { timeout: 15_000 });
    await expect(portrait.getByText('Suggested', { exact: true })).toBeVisible();
    await expect(portrait.getByText(/^Shown/)).toHaveCount(0);
  });

  test('choosing a display image fills the strip and survives reload', async ({ adminPage }) => {
    // A uniquely-titled, alt-bearing row per run (and per retry) so choosing
    // and un-choosing it never touches the shared seeded rows.
    const title = `E2E display ${randomUUID().slice(0, 8)}`;
    await createBioPaletteImageRow(title, `${title} described`);

    await gotoArtistEdit(adminPage);

    const use = adminPage.getByRole('button', { name: `Use ${title} as display image` });
    await expect(use).toHaveCount(1, { timeout: 15_000 });
    await expect(use).toBeEnabled();
    await use.click();

    const strip = adminPage.getByRole('list', { name: 'Display images' });
    // Accessible-name matching is a substring match, so the position suffix
    // ("… display image 1 of 1") need not be pinned.
    const chosen = strip.getByRole('listitem', { name: `${title}, display image` });
    await expect(chosen).toBeVisible({ timeout: 15_000 });

    // The choice is persisted by the set action, not held in form state.
    await adminPage.reload();
    await expect(chosen).toHaveCount(1, { timeout: 15_000 });
    await expect(chosen).toBeVisible();

    // Removing it from the strip is the same set write, and leaves the row in the pool.
    await adminPage.getByRole('button', { name: `Remove ${title} from display images` }).click();
    await expect(chosen).toHaveCount(0, { timeout: 15_000 });
    await expect(use).toBeEnabled();
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
    await adminPage.getByRole('button', { name: 'Insert E2E palette portrait' }).click();

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
