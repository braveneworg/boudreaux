/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { PrismaClient } from '@prisma/client';

import { expect, test } from '../fixtures/base.fixture';

/**
 * E2E coverage for the public releases listing + detail:
 *  - Releases list rows: the sleeve card sits beside an info column
 *    (release date, catalog number, format tags, description).
 *  - Releases list: clicking an album cover opens a dialog with the release
 *    info and a link through to the detail page; clicking Play opens the
 *    listening modal with the release audio player.
 *  - Release detail: the "Release Notes" section renders (cutout heading +
 *    floated summary card + notes copy).
 *
 * (The desktop hover-scale on cards is CSS-only with no JS behavior and is
 * asserted at the unit level in release-card.spec.tsx.)
 */

const E2E_DATABASE_URL =
  process.env.E2E_DATABASE_URL || 'mongodb://localhost:27018/boudreaux-e2e?replicaSet=rs0';

const prisma = new PrismaClient({ datasourceUrl: E2E_DATABASE_URL });

const RELEASE_TITLE = 'E2E Album One';

let releaseId: string;

test.beforeAll(async () => {
  const release = await prisma.release.findFirstOrThrow({
    where: { title: RELEASE_TITLE },
    select: { id: true },
  });
  releaseId = release.id;
});

test.afterAll(async () => {
  await prisma.$disconnect();
});

test.describe('Releases — cover dialog + release notes', () => {
  test('clicking an album cover opens a dialog with the release info', async ({ page }) => {
    await page.goto('/releases');

    await page.getByRole('button', { name: `Expand cover art for ${RELEASE_TITLE}` }).click();

    const dialog = page.getByRole('dialog');
    await expect(dialog.getByRole('heading', { name: RELEASE_TITLE })).toBeVisible();
    await expect(dialog.getByText('E2E Artist')).toBeVisible();
    await expect(dialog.getByText(/Released/)).toBeVisible();
  });

  test('the dialog links through to the release detail page', async ({ page }) => {
    await page.goto('/releases');
    await page.getByRole('button', { name: `Expand cover art for ${RELEASE_TITLE}` }).click();

    const detailLink = page
      .getByRole('dialog')
      .getByRole('link', { name: /view release details/i });
    await expect(detailLink).toHaveAttribute('href', `/releases/${releaseId}`);

    await detailLink.click();
    await expect(page).toHaveURL((url) => url.pathname === `/releases/${releaseId}`);
    await expect(page.getByRole('heading', { name: /release notes/i })).toBeVisible();
  });

  test('the detail page renders the Release Notes section', async ({ page }) => {
    await page.goto(`/releases/${releaseId}`);

    await expect(page.getByRole('heading', { name: /release notes/i })).toBeVisible();

    // The notes section holds the floated summary card + the notes copy.
    const notes = page.locator('section[aria-labelledby="release-notes-heading"]');
    await expect(notes).toContainText(RELEASE_TITLE);
    await expect(notes).toContainText(/Released/);
    await expect(notes).toContainText(/Lorem ipsum/i);
  });
});

test.describe('Releases — listing rows + play modal', () => {
  test('a release row shows the info column beside the sleeve card', async ({ page }) => {
    await page.goto('/releases');

    const row = page
      .locator('li')
      .filter({ has: page.getByRole('button', { name: `Play ${RELEASE_TITLE}` }) });
    await expect(row.getByText('Release date:')).toBeVisible();
    await expect(row.getByText('Pressed loud and mastered hot for the E2E stacks.')).toBeVisible();
    await expect(row.getByText('Catalog no.:')).toBeVisible();
    await expect(row.getByText('E2E-001')).toBeVisible();
    await expect(row.getByRole('list', { name: 'Available formats' })).toContainText('MP3 320KBPS');
  });

  test('Play opens the listening modal with the release player', async ({ page }) => {
    await page.goto('/releases');

    await page.getByRole('button', { name: `Play ${RELEASE_TITLE}` }).click();

    const dialog = page.getByRole('dialog');
    await expect(dialog.getByRole('heading', { name: RELEASE_TITLE })).toBeVisible();
    // The player mounts once the withTracks payload lands. Codec-agnostic:
    // assert either terminal state (video.js audio surface or the player's
    // no-tracks fallback), never a single path (see
    // docs/lessons/e2e-playwright/codec-agnostic-media-assertions.md).
    await expect(
      dialog.locator('.video-js').or(dialog.getByText(/no playable tracks/i))
    ).toBeVisible({ timeout: 15_000 });
  });

  test('closing the listening modal unmounts the player', async ({ page }) => {
    await page.goto('/releases');

    await page.getByRole('button', { name: `Play ${RELEASE_TITLE}` }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();

    await page.keyboard.press('Escape');

    await expect(dialog).not.toBeVisible();
    await expect(page.locator('.video-js')).toHaveCount(0);
  });
});
