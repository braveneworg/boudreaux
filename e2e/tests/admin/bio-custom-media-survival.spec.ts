/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { randomUUID } from 'node:crypto';

import { expect, test } from '../../fixtures/auth.fixture';
import { BIO_CUSTOM_MEDIA_ARTIST_ID } from '../../helpers/seed-test-db';

import type { Locator, Page } from '@playwright/test';

/**
 * E2E proof that an admin-authored CUSTOM bio link survives bio regeneration:
 * it stays pinned first with a "Custom" badge while the generated links are torn
 * down and rewritten. Uses a dedicated seeded artist with no initial bioStatus
 * so the palettes only appear after the spec triggers generation (the
 * CustomLinkEditor lives inside the link palette, which renders only once
 * persisted content exists). `BIO_GENERATOR_FAKE=true` runs the deterministic
 * fixture through the REAL persist → replaceBioContent path, so the preservation
 * under test is real — only the Lambda is faked.
 *
 * The fixture output is byte-identical across runs, so there is no content diff
 * to wait on for "regeneration finished". To get a deterministic completion
 * signal, the spec first DELETES a generated link, then regenerates and waits
 * for that generated link to REAPPEAR — which can only happen once the async
 * regenerate job re-inserts the generated rows. That the custom link is
 * untouched throughout is the behaviour under test.
 *
 * Custom IMAGE survival is intentionally NOT covered here: no E2E flow uploads a
 * custom bio image (the only image dialog inserts from the seeded palette
 * library, not an upload), and building S3 upload plumbing is out of scope.
 * Custom-image preservation on regen is unit-covered at the repository layer —
 * `artist-repository.spec.ts` `replaceBioContent` reads the surviving
 * `origin: 'custom'` images and deletes only generated/legacy image rows.
 */

const CUSTOM_LINK_URL = 'https://example.com/mysite';
const GENERATED_PRESS_LABEL = 'An interview with the artist';

const gotoArtistEdit = async (adminPage: Page): Promise<void> => {
  await adminPage.goto(`/admin/artists/${BIO_CUSTOM_MEDIA_ARTIST_ID}`);
  await expect(adminPage.getByRole('heading', { name: 'Edit Artist', exact: true })).toBeVisible({
    timeout: 15_000,
  });
};

/** Generate a bio and resolve once it succeeds (the Regenerate button appears). */
const generateBioToSuccess = async (adminPage: Page): Promise<Locator> => {
  const generate = adminPage.getByRole('button', { name: /generate bios/i });
  await expect(generate).toBeVisible({ timeout: 15_000 });
  await generate.click();
  const regenerate = adminPage.getByRole('button', { name: /regenerate bios/i });
  await expect(regenerate).toBeVisible({ timeout: 30_000 });
  return regenerate;
};

test.describe('Admin custom bio media survives regeneration', () => {
  test('a custom link stays pinned first and badged through a regenerate', async ({
    adminPage,
  }) => {
    // Unique per run (and per retry): the custom link survives regeneration, so a
    // retry that re-adds it would otherwise leave a duplicate row and trip
    // Playwright strict-mode matching.
    const customLabel = `My Site ${randomUUID().slice(0, 8)}`;

    await gotoArtistEdit(adminPage);

    // 1. Generate to completion so the link palette (and its CustomLinkEditor)
    //    render from the persisted fixture rows.
    const regenerate = await generateBioToSuccess(adminPage);

    const linksGroup = adminPage.getByRole('group', { name: 'Discovered links' });
    await expect(linksGroup).toHaveCount(1, { timeout: 15_000 });
    await expect(linksGroup.getByRole('button', { name: 'Delete link Wikipedia' })).toBeVisible();
    await expect(
      linksGroup.getByRole('button', { name: `Delete link ${GENERATED_PRESS_LABEL}` })
    ).toBeVisible();

    // 2. Add a custom link via the CustomLinkEditor.
    const customEditor = adminPage.getByRole('group', { name: 'Add custom link' });
    await customEditor.getByLabel('Link label').fill(customLabel);
    await customEditor.getByLabel('Link URL').fill(CUSTOM_LINK_URL);
    await customEditor.getByRole('button', { name: /add link/i }).click();

    // It appears before the generated links (custom-first sort) with a "Custom" badge.
    // Retry-safe: uses relative-ordering (customIdx < wikiIdx) rather than
    // tiles.first() — on a Playwright retry, a surviving lower-sortOrder custom
    // link from the previous attempt occupies index 0, so tiles.first() would
    // return the wrong tile and cause a spurious failure.
    const tiles = linksGroup.locator('ul > li');
    const customTile = tiles.filter({ hasText: customLabel });
    const wikiTile = tiles.filter({ hasText: 'Wikipedia' });
    await expect(customTile).toBeVisible({ timeout: 15_000 });
    await expect(wikiTile).toBeVisible();
    const customIdxPre = await customTile
      .first()
      .evaluate((el) => (el.parentElement ? [...el.parentElement.children].indexOf(el) : -1));
    const wikiIdxPre = await wikiTile
      .first()
      .evaluate((el) => (el.parentElement ? [...el.parentElement.children].indexOf(el) : -1));
    expect(customIdxPre).toBeGreaterThanOrEqual(0);
    expect(wikiIdxPre).toBeGreaterThanOrEqual(0);
    expect(customIdxPre).toBeLessThan(wikiIdxPre);
    await expect(customTile.getByText('Custom', { exact: true })).toBeVisible();

    // 3. Delete a GENERATED link so its later reappearance is a deterministic
    //    signal that regeneration completed and rewrote the generated rows.
    await linksGroup.getByRole('button', { name: `Delete link ${GENERATED_PRESS_LABEL}` }).click();
    await expect(
      linksGroup.getByRole('button', { name: `Delete link ${GENERATED_PRESS_LABEL}` })
    ).toHaveCount(0, { timeout: 15_000 });

    // 4. Regenerate; wait for the deleted generated link to come back (regen done).
    await regenerate.click();
    await expect(
      linksGroup.getByRole('button', { name: `Delete link ${GENERATED_PRESS_LABEL}` })
    ).toBeVisible({ timeout: 30_000 });

    // 5. The custom link SURVIVED regeneration: still present, still before the
    //    generated links, still badged — while generated links were torn down and
    //    re-created.
    await expect(
      linksGroup.getByRole('button', { name: `Delete link ${customLabel}` })
    ).toBeVisible();
    await expect(linksGroup.getByRole('button', { name: 'Delete link Wikipedia' })).toBeVisible();
    const customIdxPost = await customTile
      .first()
      .evaluate((el) => (el.parentElement ? [...el.parentElement.children].indexOf(el) : -1));
    const wikiIdxPost = await wikiTile
      .first()
      .evaluate((el) => (el.parentElement ? [...el.parentElement.children].indexOf(el) : -1));
    expect(customIdxPost).toBeGreaterThanOrEqual(0);
    expect(wikiIdxPost).toBeGreaterThanOrEqual(0);
    expect(customIdxPost).toBeLessThan(wikiIdxPost);
    await expect(customTile.getByText('Custom', { exact: true })).toBeVisible();
  });
});
