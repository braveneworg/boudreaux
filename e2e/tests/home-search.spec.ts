/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { expect, test } from '../fixtures/base.fixture';

import type { Locator, Page } from '@playwright/test';

/**
 * The homepage's click-to-open search (#758, #890): a hint until three
 * characters, then one row per artist with its releases under a "Releases"
 * heading and its videos under a "Videos" heading, indented under it. A
 * release or video pick plays in place, in a modal bylined by the artist of
 * the row's group. Read-only against the seed: E2E Album One is credited to
 * E2E Artist, and so is E2E Video Alpha (seed-test-db.ts).
 */

const TRIGGER_NAME = 'Search artists, releases and videos';

/** Open the search on `/` and type `query` into its field. */
const search = async (page: Page, query: string): Promise<void> => {
  await page.goto('/');
  await page.getByRole('button', { name: TRIGGER_NAME }).click();
  await expect(page.getByText('Type at least 3 characters')).toBeVisible();
  await page.getByRole('combobox', { name: TRIGGER_NAME }).fill(query);
};

const artistRow = (page: Page): Locator =>
  page.getByRole('option', { name: /^E2E Artist \d+ releases? · 1 video$/ });
const releaseRow = (page: Page): Locator =>
  page.getByRole('option', { name: 'E2E Album One', exact: true });
const videoRow = (page: Page): Locator =>
  page.getByRole('option', { name: 'E2E Video Alpha', exact: true });

const paddingLeftOf = (row: Locator): Promise<number> =>
  row.evaluate((element) => parseFloat(getComputedStyle(element).paddingLeft));

test('the home search reads artists, releases and videos', async ({ page }) => {
  await page.goto('/');

  await expect(page.getByRole('button', { name: TRIGGER_NAME })).toHaveText(
    'Search artists, releases & videos'
  );
});

test('the home search lists releases and videos under their artist', async ({ page }) => {
  await search(page, 'E2E Artist');

  await expect(artistRow(page)).toBeVisible({ timeout: 15_000 });
  await expect(
    page.getByRole('group', { name: 'Releases' }).filter({ has: releaseRow(page) })
  ).toBeVisible();
  await expect(
    page.getByRole('group', { name: 'Videos' }).filter({ has: videoRow(page) })
  ).toBeVisible();
  // A release row leads with its cover art (the seed gives every release one);
  // a video row with its poster, or the film tile when it has none.
  await expect(releaseRow(page).locator('img')).toHaveCount(1);
  await expect(videoRow(page).locator('img, svg')).toHaveCount(1);

  const [artistIndent, releaseIndent, videoIndent] = await Promise.all(
    [artistRow(page), releaseRow(page), videoRow(page)].map(paddingLeftOf)
  );
  expect(releaseIndent).toBeGreaterThan(artistIndent);
  expect(videoIndent).toBeGreaterThan(artistIndent);
});

test('a release pick plays it in a modal bylined by its artist', async ({ page }) => {
  await search(page, 'E2E Artist');
  await releaseRow(page).click();

  const dialog = page.getByRole('dialog', { name: 'E2E Artist' });
  await expect(dialog).toBeVisible();
  await expect(page).toHaveURL('/');
  await expect(dialog.getByRole('link', { name: 'E2E Artist', exact: true })).toHaveAttribute(
    'href',
    '/artists/e2e-artist'
  );
  await expect(dialog.getByRole('link', { name: 'View all releases' })).toHaveAttribute(
    'href',
    '/releases?artist=e2e-artist'
  );
  await expect(dialog.locator('.video-js')).toBeVisible({ timeout: 15_000 });

  await dialog.getByRole('button', { name: 'Close' }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByRole('button', { name: TRIGGER_NAME })).toBeFocused();
});

test('a video pick plays it in a modal bylined by its artist', async ({ page }) => {
  await search(page, 'E2E Artist');
  await videoRow(page).click();

  const dialog = page.getByRole('dialog', { name: 'E2E Artist' });
  await expect(dialog).toBeVisible();
  await expect(dialog).toHaveAccessibleDescription(/^E2E Video Alpha \(\d{4}\)$/);
  await expect(dialog.getByRole('link', { name: 'View all videos' })).toHaveAttribute(
    'href',
    '/videos?artist=e2e-artist'
  );
  // Codec- and signing-agnostic: the video plays, or the modal says it can't.
  const cannotPlay = dialog.getByText(/This video can.t be played right now\./);
  await expect(cannotPlay.or(dialog.locator('.video-js'))).toBeVisible({ timeout: 15_000 });
});

test('a search that matches nothing says so', async ({ page }) => {
  await search(page, 'zzz-no-such-artist');

  await expect(page.getByText('No artists, releases or videos found.')).toBeVisible({
    timeout: 15_000,
  });
});
