/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { PrismaClient } from '@prisma/client';

import { expect, test } from '../fixtures/base.fixture';
import {
  accentOf,
  expectSharesDeepLink,
  openReleaseDeepLink,
  releaseDeepLink,
} from '../helpers/release-deep-link';
import { isAnyMediaPlaying } from '../helpers/strict-autoplay';

/**
 * The release deep link, `/releases?artist=<slug>&release=<id>` (ADR-0023):
 * the permalink that replaced the release page. It opens the listening modal
 * over the filtered grid, paused on track 1; a release that is not listed,
 * credited or playable shows the grid alone. The old `/releases/<id>` URL
 * permanently redirects to it.
 *
 * Read-only against the seed: E2E Album One and Two by E2E Artist (the
 * regular user bought Album One, not Album Two), and E2E Band Single by
 * E2E Band (E2E Artist is a member), which has no MP3 to play.
 */

const E2E_DATABASE_URL =
  process.env.E2E_DATABASE_URL || 'mongodb://localhost:27018/boudreaux-e2e?replicaSet=rs0';

const prisma = new PrismaClient({ datasourceUrl: E2E_DATABASE_URL });

let albumOneId: string;
let albumTwoId: string;
let albumThreeId: string;
let bandSingleId: string;

test.beforeAll(async () => {
  const idOf = async (title: string): Promise<string> =>
    (await prisma.release.findFirstOrThrow({ where: { title }, select: { id: true } })).id;
  [albumOneId, albumTwoId, albumThreeId, bandSingleId] = await Promise.all(
    ['E2E Album One', 'E2E Album Two', 'E2E Album Three', 'E2E Band Single'].map(idOf)
  );
});

test.afterAll(async () => {
  await prisma.$disconnect();
});

const RELEASES_GRID_HEADING = { level: 2, name: 'Releases by E2E Artist' } as const;

test.describe('Release deep link — arrival', () => {
  test('opens the listening modal over the filtered grid, paused on track 1', async ({ page }) => {
    const dialog = await openReleaseDeepLink(page, albumOneId);

    await expect(dialog).toContainText('E2E Album One');
    await expect(dialog).toContainText('E2E Track Alpha');
    // The open modal hides the grid from the accessibility tree; it is still there.
    await expect(
      page.getByRole('heading', { ...RELEASES_GRID_HEADING, includeHidden: true })
    ).toBeAttached();
    // No gesture brought the visitor here, so nothing plays until they press
    // play: once track 1 has data to play, it is still paused at the start.
    // (The audio player adds `vjs-has-started` itself, to show its controls.)
    const audio = dialog.locator('audio');
    await expect
      .poll(() => audio.evaluate((element) => (element as HTMLAudioElement).readyState), {
        timeout: 15_000,
      })
      .toBeGreaterThanOrEqual(2);
    await expect(dialog.locator('.video-js')).toHaveClass(/vjs-paused/);
    expect(await audio.evaluate((element) => (element as HTMLAudioElement).currentTime)).toBe(0);
    expect(await isAnyMediaPlaying(page)).toBe(false);
  });

  test('frames the modal in a loud accent and shares the deep link', async ({ page }) => {
    const dialog = await openReleaseDeepLink(page, albumOneId);

    expect(await accentOf(dialog)).toMatch(/^zine-accent-(?!yellow|tan|kraft)/);
    await expectSharesDeepLink(dialog, albumOneId);
  });

  test('frames a release in the same accent as the artist page does', async ({ page }) => {
    const deepLinked = await openReleaseDeepLink(page, albumThreeId);
    const deepLinkAccent = await accentOf(deepLinked);

    await page.goto('/artists/e2e-artist');
    const latest = page.getByRole('link', { name: 'E2E Album Three' });
    await expect(latest).toHaveAttribute('aria-haspopup', 'dialog', { timeout: 15_000 });
    await latest.click();
    const fromArtistPage = page.getByRole('dialog');
    await expect(fromArtistPage).toBeVisible();

    expect(await accentOf(fromArtistPage)).toBe(deepLinkAccent);
  });

  test("closing leaves the artist's releases, and a refresh opens no modal", async ({ page }) => {
    const dialog = await openReleaseDeepLink(page, albumOneId);

    await dialog.getByRole('button', { name: 'Close' }).click();

    await expect(page).toHaveURL(/\/releases\?artist=e2e-artist$/);
    await expect(dialog).toHaveCount(0);
    await page.reload();
    await expect(page.getByRole('heading', RELEASES_GRID_HEADING)).toBeVisible();
    await expect(page.getByRole('dialog')).toHaveCount(0);
  });

  test('shows the grid alone for a release id that is not an ObjectId', async ({ page }) => {
    const response = await page.goto('/releases?artist=e2e-artist&release=garbage');

    expect(response?.status()).toBe(200);
    await expect(page.getByRole('heading', RELEASES_GRID_HEADING)).toBeVisible();
    await expect(page.getByRole('dialog')).toHaveCount(0);
  });

  test('shows the grid alone for a release with nothing to play', async ({ page }) => {
    const response = await page.goto(releaseDeepLink(bandSingleId));

    expect(response?.status()).toBe(200);
    await expect(page.getByRole('heading', RELEASES_GRID_HEADING)).toBeVisible();
    await expect(page.getByRole('dialog')).toHaveCount(0);
  });
});

test.describe('Release deep link — the old release URL', () => {
  test("permanently redirects /releases/<id> to the album artist's deep link", async ({ page }) => {
    const response = await page.request.get(`/releases/${albumOneId}`, { maxRedirects: 0 });

    expect(response.status()).toBe(308);
    expect(response.headers()['location']).toBe(releaseDeepLink(albumOneId));
  });

  for (const releaseId of ['000000000000000000000000', 'not-an-id']) {
    test(`is a themed 404 for an id with no deep link (${releaseId})`, async ({ page }) => {
      const response = await page.goto(`/releases/${releaseId}`);

      expect(response?.status()).toBe(404);
      await expect(page.getByRole('img', { name: 'release not found' })).toBeVisible();
      await expect(page.getByRole('link', { name: 'Back to Releases' })).toHaveAttribute(
        'href',
        '/releases'
      );
    });
  }
});

test.describe('Release deep link — downloads', () => {
  test('offers the download trigger in the modal', async ({ userPage }) => {
    const dialog = await openReleaseDeepLink(userPage, albumOneId);

    await expect(dialog.getByRole('button', { name: 'Download' })).toBeVisible();
  });

  test('a purchased release shows the returning purchaser dialog', async ({ userPage }) => {
    // The regular user has purchased E2E Album One.
    const dialog = await openReleaseDeepLink(userPage, albumOneId);
    await dialog.getByRole('button', { name: 'Download' }).click();

    await expect(userPage.getByText('You already purchased this on')).toBeVisible({
      timeout: 10_000,
    });
    await expect(userPage.getByRole('button', { name: /Buy & Download/i })).not.toBeVisible();
  });

  test('an unpurchased release shows the free and premium options', async ({ userPage }) => {
    // The regular user has NOT purchased E2E Album Two.
    const dialog = await openReleaseDeepLink(userPage, albumTwoId);
    await dialog.getByRole('button', { name: 'Download' }).click();

    await expect(userPage.getByLabel(/FREE digital formats.*320Kbps.*AAC/i)).toBeVisible({
      timeout: 5_000,
    });
    await expect(userPage.getByLabel(/Premium digital formats/i)).toBeVisible();
  });
});
