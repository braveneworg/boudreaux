/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { expect, test } from '../../fixtures/base.fixture';

/**
 * E2E coverage for /artists/[slug]/releases: every release credit of the
 * seeded artist as a card, grouped by credit, each playable one with the
 * same Play flow as /releases. The seed gives E2E Artist three own albums
 * and a band (E2E Band) release through membership.
 */

test.describe('Artist releases page', () => {
  test('lists every release credit under its group, headed by the artist', async ({ page }) => {
    await page.goto('/artists/e2e-artist/releases');

    await expect(page.getByRole('heading', { level: 1, name: 'E2E Artist' })).toBeVisible({
      timeout: 15_000,
    });
    const own = page.getByRole('region', { name: 'Own releases' });
    await expect(own.getByRole('heading', { level: 3, name: 'E2E Album One' })).toBeVisible();
    await expect(own.getByRole('heading', { level: 3, name: 'E2E Album Two' })).toBeVisible();
    await expect(own.getByRole('heading', { level: 3, name: 'E2E Album Three' })).toBeVisible();
    await expect(page.getByRole('region', { name: 'With the band' })).toBeVisible();
  });

  test('plays a release from its card in the listening modal', async ({ page }) => {
    await page.goto('/artists/e2e-artist/releases');

    const play = page.getByRole('button', { name: 'Play E2E Album Two' });
    await expect(play).toBeEnabled({ timeout: 15_000 });
    await play.click();

    const dialog = page.getByRole('dialog');
    await expect(dialog.getByRole('heading', { name: 'E2E Album Two' })).toBeVisible();
    // Codec-agnostic: either terminal state of the player, never one path
    // (docs/lessons/e2e-playwright/codec-agnostic-media-assertions.md).
    await expect(
      dialog.locator('.video-js').or(dialog.getByText(/no playable tracks/i))
    ).toBeVisible({ timeout: 15_000 });
  });

  test('shows the not-found page for an unknown artist', async ({ page }) => {
    await page.goto('/artists/no-such-artist/releases');

    // The dev server streams the shell before `notFound()` settles the status,
    // so the page's own copy is the reliable signal, not the response code.
    await expect(page.getByText(/torn off the wall/i)).toBeVisible({ timeout: 15_000 });
  });
});
