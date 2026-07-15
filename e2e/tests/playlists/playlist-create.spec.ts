/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { expect, test } from '../../fixtures/base.fixture';
import { PlaylistsPage } from '../../pages/playlists-page';

const TRACK_ALPHA = 'E2E Track Alpha';
const TRACK_BETA = 'E2E Track Beta';

/**
 * Playlist create flow. `/playlists` is signed-in only (the former placeholder
 * page is gone), and the creator's first added item auto-opens the save dialog
 * — the create path rides that choreography end to end: search → add → save
 * dialog → From-artists cover select → public toggle → save → list row.
 *
 * Playlist titles embed the retry index + a timestamp: titles are unique per
 * owner forever (`@@unique([ownerId, title])`) and all playlist specs share
 * the seeded fixture user, so a CI retry (same DB) must never collide with a
 * row a failed attempt already created.
 */
test.describe('Playlist create', () => {
  test('redirects a signed-out visitor to /signin', async ({ page }) => {
    await page.goto('/playlists');

    await expect(page).toHaveURL(/\/signin/);
  });

  test('creates a public playlist from the first added track', async ({ userPage }, testInfo) => {
    const title = `My Mix ${testInfo.retry}-${Date.now()}`;
    const playlists = new PlaylistsPage(userPage);
    await playlists.goto();

    // The FIRST added item of a draft session auto-opens the save dialog.
    await playlists.search(TRACK_ALPHA);
    await playlists.addSongResult(TRACK_ALPHA);
    const dialog = playlists.saveDialog('create');
    await expect(dialog).toBeVisible();

    await dialog.getByLabel('Title').fill(title);

    // From-artists cover select — the staged item's release art feeds the tab.
    await dialog.getByRole('tab', { name: 'From artists' }).click();
    const artistImage = dialog.getByRole('button', { name: 'Artist image 1' });
    await artistImage.click();
    await expect(artistImage).toHaveAttribute('aria-pressed', 'true');

    const publicSwitch = dialog.getByRole('switch', { name: 'Public playlist' });
    await publicSwitch.click();
    await expect(publicSwitch).toHaveAttribute('aria-checked', 'true');

    await dialog.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(dialog).toBeHidden();

    // The row appears with the title and Public visibility.
    const row = playlists.rowByTitle(title);
    await expect(row).toBeVisible();
    await expect(row).toContainText('1 item · Public');

    // Add a second track — the playlist is saved now, so the add goes through
    // the server mutation and the row's denormalized meta refreshes.
    await playlists.search(TRACK_BETA);
    await playlists.addSongResult(TRACK_BETA);
    await expect(playlists.creatorItemByTitle(TRACK_BETA)).toBeVisible();

    await expect(row).toContainText('2 items · Public');
    // Total duration: two seeded 210s tracks → 420s → "7:00".
    await expect(row).toContainText('7:00');
  });
});
