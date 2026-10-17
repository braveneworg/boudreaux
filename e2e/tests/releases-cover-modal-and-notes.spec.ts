/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { expect, test } from '../fixtures/base.fixture';
import { edgesOfAll } from '../helpers/layout-edges';
import { blockAutoplayWithoutGesture, isAnyMediaPlaying } from '../helpers/strict-autoplay';

import type { Locator, Page } from '@playwright/test';

/**
 * E2E coverage for the public releases listing:
 *  - Releases listing: laid out like the home page — the search, then the
 *    RELEASES wordmark, then a 1/2/4-column grid of covers captioned with the
 *    artist above the title. A cover opens the home page's listening modal on
 *    the release's first track, in the page's cyan accent.
 *  - Artist filter: a caption's artist link lists every release that artist
 *    holds a credit on, their band's included (`/releases?artist=<slug>`),
 *    named under the wordmark with a "View releases by all artists" link
 *    back. A slug naming no public artist is a 404.
 *  - Search: a picked release opens its listening modal in place.
 *
 * Read-only against the seed: E2E Album One, Two and Three by E2E Artist,
 * E2E Band Single by E2E Band (E2E Artist is its member), and E2E Roster
 * Compilation by the roster artists (seed-test-db.ts).
 */

const RELEASE_TITLE = 'E2E Album One';
const ARTIST_NAME = 'E2E Artist';
const ARTIST_SLUG = 'e2e-artist';
const COVER_NAME = `Play ${RELEASE_TITLE} by ${ARTIST_NAME}`;
const ARTIST_RELEASE_TITLES = ['E2E Album One', 'E2E Album Two', 'E2E Album Three'];
/** A release by a band E2E Artist is a member of: in the artist's grid. */
const BAND_COVER_NAME = 'Play E2E Band Single by E2E Band';
/** A release E2E Artist holds no credit on, on the first page of the full grid. */
const UNRELATED_COVER_NAME = /^Play E2E Roster Compilation\b/;
const ALL_ARTISTS_LINK = 'View releases by all artists';
const TAP_HINT = 'Tap any release art to play or download the music';

/** The E2E Album One cover button, once its click handler is attached. */
const hydratedCover = async (page: Page): Promise<Locator> => {
  const cover = page.getByRole('button', { name: COVER_NAME });
  // The server markup already has the button; a click before hydration is
  // lost (docs/lessons/e2e-playwright/wait-for-the-dropzone-to-hydrate-before-setting-a-file.md).
  await expect(cover).toHaveAttribute('data-hydrated', 'true', { timeout: 15_000 });
  return cover;
};

/** The listening modal, named by the artist as on the home page. */
const listeningModal = (page: Page): Locator => page.getByRole('dialog', { name: ARTIST_NAME });

/** Open the E2E Album One listening modal and wait for its player. */
const openCover = async (page: Page): Promise<Locator> => {
  await page.goto('/releases');
  await (await hydratedCover(page)).click();

  const dialog = listeningModal(page);
  await expect(dialog.locator('.video-js')).toBeVisible({ timeout: 15_000 });
  return dialog;
};

/** Let the modal's open animation finish, so its boxes are where they rest. */
const settle = async (dialog: Locator): Promise<void> => {
  await dialog.evaluate((element) =>
    Promise.all(element.getAnimations().map((animation) => animation.finished))
  );
};

/** The resolved `--card-accent` on an element. */
const cardAccentOf = (locator: Locator): Promise<string> =>
  locator.evaluate((element) => getComputedStyle(element).getPropertyValue('--card-accent').trim());

test.describe('Releases — cover grid + listening modal', () => {
  test('serves the covers in the initial HTML payload', async ({ page }) => {
    // The raw response body, not the DOM: the covers are server-rendered from
    // the prefetched first page.
    const response = await page.request.get('/releases');
    expect(response.ok()).toBe(true);

    const html = await response.text();
    expect(html).toContain(`aria-label="${COVER_NAME}"`);
    expect(html).toContain(`alt="${RELEASE_TITLE} cover art"`);
  });

  test('captions the cover with the artist, linked to their releases, above the title', async ({
    page,
  }) => {
    await page.goto('/releases');
    const cover = await hydratedCover(page);

    const card = page.getByRole('listitem').filter({ has: cover });
    const artist = card.getByRole('link', { name: ARTIST_NAME, exact: true });
    const title = card.getByText(RELEASE_TITLE, { exact: true });
    await expect(artist).toHaveAttribute('href', `/releases?artist=${ARTIST_SLUG}`);
    await expect(card).toHaveText(`${ARTIST_NAME}${RELEASE_TITLE}`);
    await expect(card.getByRole('link')).toHaveCount(1);

    const [artistBox, titleBox] = await edgesOfAll([artist, title]);
    expect(artistBox.bottom).toBeLessThanOrEqual(titleBox.top);
  });

  test('an artist link lists that artist’s releases, their band’s included, and the all-artists link lists every release again', async ({
    page,
  }) => {
    await page.goto('/releases');
    const cover = await hydratedCover(page);
    // Set on this document: a full page load would drop it.
    await page.evaluate(() => {
      (window as Window & { releasesNoReload?: boolean }).releasesNoReload = true;
    });
    const stillSameDocument = (): Promise<boolean | undefined> =>
      page.evaluate(() => (window as Window & { releasesNoReload?: boolean }).releasesNoReload);

    await page
      .getByRole('listitem')
      .filter({ has: cover })
      .getByRole('link', { name: ARTIST_NAME, exact: true })
      .click();

    await expect(page).toHaveURL(`/releases?artist=${ARTIST_SLUG}`);
    const allArtists = page.getByRole('link', { name: ALL_ARTISTS_LINK });
    await expect(allArtists).toHaveAttribute('href', '/releases');
    const grid = page
      .getByRole('list')
      .filter({ has: page.getByRole('button', { name: COVER_NAME }) });
    for (const title of ARTIST_RELEASE_TITLES) {
      await expect(
        grid.getByRole('button', { name: `Play ${title} by ${ARTIST_NAME}` })
      ).toBeVisible();
    }
    // The band the artist belongs to is in; a release they hold no credit on is out.
    await expect(grid.getByRole('button', { name: BAND_COVER_NAME })).toBeVisible();
    await expect(page.getByRole('button', { name: UNRELATED_COVER_NAME })).toHaveCount(0);
    const artistHeading = page.getByRole('heading', {
      level: 2,
      name: `Releases by ${ARTIST_NAME}`,
    });
    await expect(artistHeading).toBeVisible();

    // The artist's name sits under the wordmark and the link under the name,
    // its eye icon left of the words.
    const [headingBox, artistBox, linkBox, iconBox, wordsBox] = await edgesOfAll([
      page.getByRole('img', { name: 'releases', exact: true }),
      artistHeading,
      allArtists,
      allArtists.locator('svg'),
      allArtists.getByText(ALL_ARTISTS_LINK, { exact: true }),
    ]);
    expect(artistBox.top).toBeGreaterThanOrEqual(headingBox.bottom);
    expect(artistBox.top - headingBox.bottom).toBeLessThan(24);
    expect(linkBox.top).toBeGreaterThanOrEqual(artistBox.bottom);
    expect(linkBox.top - artistBox.bottom).toBeLessThan(24);
    expect(iconBox.right).toBeLessThanOrEqual(wordsBox.left);
    expect(await stillSameDocument()).toBe(true);

    await allArtists.click();

    await expect(page).toHaveURL('/releases');
    await expect(page.getByRole('button', { name: UNRELATED_COVER_NAME })).toBeVisible();
    await expect(page.getByRole('link', { name: ALL_ARTISTS_LINK })).toHaveCount(0);
    expect(await stillSameDocument()).toBe(true);
  });

  test('shows the not-found page for an unknown artist', async ({ page }) => {
    await page.goto('/releases?artist=no-such-artist');

    // The dev server streams the shell before `notFound()` settles the status,
    // so the page's own copy is the reliable signal, not the response code.
    await expect(page.getByText(/torn off the wall/i)).toBeVisible({ timeout: 15_000 });
  });

  test('shows none of the old listing row details', async ({ page }) => {
    await page.goto('/releases');
    await hydratedCover(page);

    await expect(page.getByText(`${RELEASE_TITLE} (2024)`)).toHaveCount(0);
    await expect(page.getByText('Release date:')).toHaveCount(0);
    await expect(page.getByText('Catalog no.:')).toHaveCount(0);
    await expect(page.getByRole('list', { name: 'Available formats' })).toHaveCount(0);
    await expect(
      page.getByRole('button', { name: `Expand cover art for ${RELEASE_TITLE}` })
    ).toHaveCount(0);
  });

  for (const { width, columns } of [
    { width: 375, columns: 1 },
    { width: 768, columns: 2 },
    { width: 1280, columns: 4 },
  ]) {
    test(`puts the search above the wordmark and the covers ${columns} to a row at ${width}px`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.goto('/releases');

      const cover = await hydratedCover(page);
      const grid = page.getByRole('list').filter({ has: cover });
      const covers = grid.getByRole('listitem').getByRole('button');
      const search = page.getByRole('button', { name: 'Search releases' });
      const heading = page.getByRole('img', { name: 'releases', exact: true });
      const [firstBox, lastInRowBox, gridBox, searchBox, headingBox] = await edgesOfAll([
        covers.first(),
        covers.nth(columns - 1),
        grid,
        search,
        heading,
      ]);

      expect(headingBox.top).toBeGreaterThanOrEqual(searchBox.bottom);
      expect(headingBox.bottom).toBeLessThanOrEqual(gridBox.top);
      // The search spans the outer cover edges of the first row, as on home.
      expect(searchBox.left).toBeCloseTo(firstBox.left, 0);
      expect(searchBox.right).toBeCloseTo(lastInRowBox.right, 0);

      const trackCount = await grid.evaluate(
        (element) => getComputedStyle(element).gridTemplateColumns.split(' ').length
      );
      expect(trackCount).toBe(columns);
    });
  }

  // #720: the cover starts the audio at once, even where play() needs a user
  // gesture, and closing the modal leaves nothing playing.
  test('opens the artist-first modal playing the first track, and Escape stops it', async ({
    page,
  }) => {
    await blockAutoplayWithoutGesture(page);
    const dialog = await openCover(page);

    await expect(dialog).toHaveAccessibleDescription(RELEASE_TITLE);
    const audio = dialog.locator('audio.vjs-tech');
    await expect(audio).toBeAttached({ timeout: 10_000 });
    await expect
      .poll(() => audio.evaluate((element) => (element as HTMLAudioElement).currentTime), {
        timeout: 5_000,
      })
      .toBeGreaterThan(0);
    await expect(dialog.locator('[data-slot="release-play-dialog-share"]')).toBeVisible();

    await page.keyboard.press('Escape');

    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect.poll(() => isAnyMediaPlaying(page)).toBe(false);
    await expect(page.getByRole('button', { name: COVER_NAME })).toBeFocused();
  });

  test('offers the share links and the download flow in the modal', async ({ page }) => {
    const dialog = await openCover(page);

    await expect(dialog.getByRole('button', { name: 'Share on Facebook' })).toBeVisible({
      timeout: 15_000,
    });
    await dialog.getByRole('button', { name: 'Download', exact: true }).click();

    await expect(page.getByRole('radio', { name: /MP3 \(320Kbps\) and AAC/i })).toBeVisible({
      timeout: 15_000,
    });
  });

  test('gives the modal the page’s cyan accent', async ({ page }) => {
    const dialog = await openCover(page);

    const panelAccent = await cardAccentOf(page.locator('[data-slot="zine-panel"]'));
    expect(await cardAccentOf(dialog)).toBe(panelAccent);
    // Not the root pink the portaled modal would fall back to.
    expect(panelAccent).not.toBe(await cardAccentOf(page.locator('html')));
  });

  test('keeps the tap hint off a pointer screen', async ({ page }) => {
    await page.goto('/releases');
    await hydratedCover(page);

    await expect(page.getByText('any release art to play or download the music')).toBeHidden();
  });
});

test.describe('Releases — search', () => {
  test('a picked release opens its listening modal in place, the URL unchanged', async ({
    page,
  }) => {
    await page.goto('/releases');
    await page.getByRole('button', { name: 'Search releases' }).click();
    await page.getByPlaceholder(/search by artist/i).fill(RELEASE_TITLE);
    await page.getByRole('option', { name: new RegExp(RELEASE_TITLE) }).click();

    const dialog = listeningModal(page);
    await expect(dialog.locator('.video-js')).toBeVisible({ timeout: 15_000 });
    await expect(dialog).toContainText(RELEASE_TITLE);
    await expect(page).toHaveURL(/\/releases$/);
  });
});

test.describe('Releases — cover grid on a 390×844 phone', () => {
  // A phone: no hover, so `(hover: none)` matches.
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

  test('tells the visitor to tap a cover', async ({ page }) => {
    await page.goto('/releases');
    await hydratedCover(page);

    const hint = page.getByText('any release art to play or download the music');
    await expect(hint).toBeVisible();
    await expect(hint).toHaveText(TAP_HINT);
  });

  test('slides the modal up as a full-width bottom sheet', async ({ page }) => {
    await page.goto('/releases');
    await (await hydratedCover(page)).tap();
    const dialog = listeningModal(page);
    await expect(dialog.locator('.video-js')).toBeVisible({ timeout: 15_000 });
    await settle(dialog);

    const sheet = await dialog.boundingBox();
    if (!sheet) throw new Error('missing the sheet box');
    expect(sheet.x).toBe(0);
    expect(sheet.width).toBe(390);
    expect(sheet.y + sheet.height).toBeCloseTo(844, 0);
  });
});
