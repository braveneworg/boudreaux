/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { expect, type Locator, type Page } from '@playwright/test';

/** The seeded artist credited on E2E Album One, Two and Three. */
const E2E_ARTIST = { slug: 'e2e-artist', name: 'E2E Artist' };

interface DeepLinkArtist {
  /** The `?artist=` slug: an artist credited on the release. */
  slug: string;
  /** The album artist the listening modal is named by (artist first). */
  name: string;
}

/** The release deep link, `/releases?artist=<slug>&release=<id>` (ADR-0023). */
export const releaseDeepLink = (releaseId: string, artistSlug = E2E_ARTIST.slug): string =>
  `/releases?artist=${encodeURIComponent(artistSlug)}&release=${releaseId}`;

/**
 * Open a release's listening modal by its deep link, the way a shared link
 * arrives, and wait for its player. The modal opens paused on track 1 and
 * is named by the album artist.
 */
export const openReleaseDeepLink = async (
  page: Page,
  releaseId: string,
  artist: DeepLinkArtist = E2E_ARTIST
): Promise<Locator> => {
  await page.goto(releaseDeepLink(releaseId, artist.slug));
  const dialog = page.getByRole('dialog', { name: artist.name });
  await expect(dialog.locator('.video-js')).toBeVisible({ timeout: 15_000 });
  return dialog;
};

/**
 * Assert that a listening modal's share row shares the release deep link,
 * read from the SMS share link, whose body carries the shared URL.
 */
export const expectSharesDeepLink = async (
  dialog: Locator,
  releaseId: string,
  artistSlug = E2E_ARTIST.slug
): Promise<void> => {
  const sms = dialog.getByRole('link', { name: 'Share via SMS' });
  await expect
    .poll(() => sms.getAttribute('href'), { timeout: 15_000 })
    .toContain(encodeURIComponent(releaseDeepLink(releaseId, artistSlug)));
};

/** The `zine-accent-*` class framing a listening modal. */
export const accentOf = async (dialog: Locator): Promise<string | undefined> =>
  (await dialog.getAttribute('class'))
    ?.split(/\s+/)
    .find((name) => name.startsWith('zine-accent-'));
