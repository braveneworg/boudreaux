/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { expect, test } from '../fixtures/base.fixture';
import { edgesOfAll } from '../helpers/layout-edges';

import type { Locator, Page } from '@playwright/test';

/**
 * The home page's spotlight grid, against the seeded spotlight: "E2E Featured
 * Artist" on E2E Album One (released 2024), linked to E2E Artist and to the
 * album's MP3 format (seed-test-db.ts). Read-only against the seed.
 */

const COVER_NAME = 'Play E2E Album One by E2E Featured Artist';

/** `-ml-1.5` on the FEATURED wordmark: 0.375rem at the 16px root size. */
const WORDMARK_INK_OFFSET_PX = 6;

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

/** Let the modal's open animation finish, so its boxes are where they rest. */
const settle = async (dialog: Locator): Promise<void> => {
  await dialog.evaluate((element) =>
    Promise.all(element.getAnimations().map((animation) => animation.finished))
  );
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
    expect(html).toContain('>E2E Featured Artist</a>');
    expect(html).toContain('>E2E Album One (2024)</p>');
  });

  test('captions the card with the linked artist, then the title and year', async ({ page }) => {
    await page.goto('/');

    const card = page
      .getByRole('listitem')
      .filter({ has: page.getByRole('button', { name: COVER_NAME }) });
    await expect(
      card.getByRole('link', { name: 'E2E Featured Artist', exact: true })
    ).toHaveAttribute('href', '/artists/e2e-artist', { timeout: 15_000 });
    await expect(card.getByText('E2E Album One (2024)', { exact: true })).toBeVisible();
    await expect(card.getByRole('link', { name: 'E2E Album One', exact: true })).toHaveCount(0);
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

  // One, two and four columns. The seed has one card, so the last column's
  // cover edge is found by symmetry: every cell is as wide, and every cover is
  // centered in its cell, so it sits as far in from the grid's right edge as
  // the first cover sits in from its left.
  for (const width of [375, 768, 1280]) {
    test(`lines the search and heading up with the outer cover edges at ${width}px`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.goto('/');

      const cover = await hydratedCover(page);
      const grid = page.getByRole('list').filter({ has: cover });
      const search = page.getByRole('button', { name: 'Search artists and releases' });
      const heading = page.getByRole('img', { name: 'featured artists' });
      const [coverBox, gridBox, searchBox, headingBox] = await edgesOfAll([
        cover,
        grid,
        search,
        heading,
      ]);

      const inset = coverBox.left - gridBox.left;
      expect(searchBox.left).toBeCloseTo(coverBox.left, 0);
      expect(searchBox.right).toBeCloseTo(gridBox.right - inset, 0);
      // The wordmark sits below the search with its ink flush to the search's
      // left edge. The artwork carries its own left padding, so the image box
      // is pulled 6px (`-ml-1.5`) left of the search box to put the ink there.
      expect(headingBox.left).toBeCloseTo(searchBox.left - WORDMARK_INK_OFFSET_PX, 0);
      expect(headingBox.top).toBeGreaterThanOrEqual(searchBox.bottom);
      expect(headingBox.bottom).toBeLessThanOrEqual(gridBox.top);
    });
  }

  test('keeps the tap hint off a pointer screen', async ({ page }) => {
    await page.goto('/');
    await hydratedCover(page);

    await expect(page.getByText('any release art to play or download the music')).toBeHidden();
  });

  test('keeps the modal centered on a wide screen', async ({ page }) => {
    const dialog = await openSpotlight(page);
    await settle(dialog);

    const box = await dialog.boundingBox();
    const viewport = page.viewportSize();
    if (!box || !viewport) throw new Error('missing a layout box');

    expect(box.x + box.width / 2).toBeCloseTo(viewport.width / 2, 0);
    expect(box.y + box.height / 2).toBeCloseTo(viewport.height / 2, 0);
  });

  test('returns focus to the cover when the modal closes', async ({ page }) => {
    const dialog = await openSpotlight(page);

    await page.keyboard.press('Escape');

    await expect(dialog).toBeHidden();
    await expect(page.getByRole('button', { name: COVER_NAME })).toBeFocused();
  });
});

test.describe('home spotlight grid on a touch screen', () => {
  // A phone: no hover, so `(hover: none)` matches.
  test.use({ viewport: { width: 375, height: 812 }, hasTouch: true, isMobile: true });

  test('tells the visitor to tap a cover, and shows no play stamp', async ({ page }) => {
    await page.goto('/');
    const cover = await hydratedCover(page);

    const hint = page.getByText('any release art to play or download the music');
    await expect(hint).toBeVisible();
    await expect(hint).toHaveText('Tap any release art to play or download the music');
    await expect(cover.locator('[data-slot="spotlight-play-stamp"]')).toHaveCSS('opacity', '0');
  });
});

test.describe('home spotlight grid on a 375×667 phone', () => {
  // iPhone SE class: the shortest phone screen the listening sheet must fit.
  test.use({ viewport: { width: 375, height: 667 }, hasTouch: true, isMobile: true });

  test('slides the modal up as a sheet that fits without scrolling', async ({ page }) => {
    await page.goto('/');
    await (await hydratedCover(page)).tap();
    const dialog = page.getByRole('dialog', { name: 'E2E Featured Artist' });
    await expect(dialog.locator('.video-js')).toBeVisible({ timeout: 15_000 });
    await settle(dialog);

    // Pinned to the bottom edge, full width, with the page still showing above.
    const sheet = await dialog.boundingBox();
    if (!sheet) throw new Error('missing the sheet box');
    expect(sheet.x).toBe(0);
    expect(sheet.width).toBe(375);
    expect(sheet.y + sheet.height).toBeCloseTo(667, 0);
    expect(sheet.y).toBeGreaterThan(0);

    // Nothing in it scrolls.
    const overflow = await dialog.evaluate(
      (element) => element.scrollHeight - element.clientHeight
    );
    expect(overflow).toBeLessThanOrEqual(0);

    // Heading, cover, controls, tracks row and share row all on screen.
    const parts = [
      dialog.getByRole('heading', { name: 'E2E Featured Artist' }),
      dialog.getByText('E2E Album One', { exact: true }),
      dialog.getByRole('img', { name: 'E2E Album One cover art' }),
      dialog.locator('.video-js'),
      dialog.getByRole('button', { name: 'View', exact: true }),
      dialog.getByRole('button', { name: 'Download', exact: true }),
      dialog.locator('[data-slot="release-play-dialog-share"]'),
    ];
    for (const part of parts) {
      const box = await part.boundingBox();
      if (!box) throw new Error('missing a part box');
      expect(box.y).toBeGreaterThanOrEqual(sheet.y);
      expect(box.y + box.height).toBeLessThanOrEqual(667);
    }
  });
});
