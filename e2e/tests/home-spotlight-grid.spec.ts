/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { expect, test } from '../fixtures/base.fixture';

import type { Locator, Page } from '@playwright/test';

/**
 * The home page's spotlight grid, against the seeded spotlight: "E2E Featured
 * Artist" on E2E Album One (released 2024), linked to E2E Artist and to the
 * album's MP3 format (seed-test-db.ts). Read-only against the seed.
 */

const COVER_NAME = 'Play E2E Album One by E2E Featured Artist';

/** The seeded spotlight's cover button, once its click handler is attached. */
const hydratedCover = async (page: Page): Promise<Locator> => {
  const cover = page.getByRole('button', { name: COVER_NAME });
  // The server markup already has the button; a click before hydration is
  // lost (docs/lessons/e2e-playwright/wait-for-the-dropzone-to-hydrate-before-setting-a-file.md).
  await expect(cover).toHaveAttribute('data-hydrated', 'true', { timeout: 15_000 });
  return cover;
};

/** Open the seeded spotlight's listening modal and wait for its player. */
const openSpotlight = async (page: Page): Promise<Locator> => {
  await page.goto('/');
  await (await hydratedCover(page)).click();

  const dialog = page.getByRole('dialog', { name: 'E2E Featured Artist' });
  await expect(dialog.locator('.video-js')).toBeVisible({ timeout: 15_000 });
  return dialog;
};

test.describe('home spotlight grid', () => {
  test('serves the spotlight cards in the initial HTML payload', async ({ page }) => {
    // The raw response body, not the DOM: the covers must be discoverable by
    // the preload scanner before any script runs.
    const response = await page.request.get('/');
    expect(response.ok()).toBe(true);

    const html = await response.text();
    expect(html).toContain('alt="E2E Album One cover art"');
    expect(html).toContain(`aria-label="${COVER_NAME}"`);
    expect(html).toContain('>E2E Featured Artist</p>');
    expect(html).toContain('>E2E Album One</a> (2024)');
  });

  test('captions the card with the artist, then the linked title and year', async ({ page }) => {
    await page.goto('/');

    const card = page
      .getByRole('listitem')
      .filter({ has: page.getByRole('button', { name: COVER_NAME }) });
    await expect(card.getByText('E2E Featured Artist', { exact: true })).toBeVisible({
      timeout: 15_000,
    });
    await expect(card.getByText('E2E Album One (2024)', { exact: true })).toBeVisible();
    await expect(card.getByRole('link', { name: 'E2E Album One', exact: true })).toHaveAttribute(
      'href',
      '/artists/e2e-artist/releases'
    );
  });

  test('opens the modal artist first, with the tracks row under the player', async ({ page }) => {
    const dialog = await openSpotlight(page);

    await expect(dialog).toHaveAccessibleDescription('E2E Album One');

    const viewTracks = dialog.getByRole('button', { name: 'View', exact: true });
    await expect(viewTracks).toBeVisible();
    await expect(dialog.getByText('all 1 tracks')).toBeVisible();

    // The "View … all 1 tracks" row sits below the cover and the controls.
    const [controlsBox, viewBox] = await Promise.all([
      dialog.locator('.video-js').boundingBox(),
      viewTracks.boundingBox(),
    ]);
    expect(controlsBox).not.toBeNull();
    expect(viewBox).not.toBeNull();
    expect(viewBox?.y ?? 0).toBeGreaterThanOrEqual(
      (controlsBox?.y ?? Number.POSITIVE_INFINITY) + (controlsBox?.height ?? 0)
    );
  });

  test('offers the share links in the modal', async ({ page }) => {
    const dialog = await openSpotlight(page);

    await expect(dialog.getByRole('button', { name: 'Share on Facebook' })).toBeVisible({
      timeout: 15_000,
    });
    await expect(dialog.getByRole('link', { name: 'Share via SMS' })).toBeVisible();
  });

  test('opens the download flow from the modal', async ({ page }) => {
    const dialog = await openSpotlight(page);

    await dialog.getByRole('button', { name: 'Download', exact: true }).click();

    await expect(page.getByRole('radio', { name: /MP3 \(320Kbps\) and AAC/i })).toBeVisible({
      timeout: 15_000,
    });
  });

  test('returns focus to the cover when the modal closes', async ({ page }) => {
    const dialog = await openSpotlight(page);

    await page.keyboard.press('Escape');

    await expect(dialog).toBeHidden();
    await expect(page.getByRole('button', { name: COVER_NAME })).toBeFocused();
  });
});
