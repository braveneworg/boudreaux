/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { expect, test } from '../../fixtures/base.fixture';
import { PlaylistsPage } from '../../pages/playlists-page';

const TRACK_GAMMA = 'E2E Track Gamma';

/**
 * Duplicate-confirm + delete flow. Duplicate choreography (draft path, chosen
 * over the server-side `force` retry path): the FIRST add auto-opens the save
 * dialog — Cancel it (the item stays staged in the draft), add the SAME track
 * again to trigger the draft duplicate confirm, and "Add again" force-stages
 * the second copy. The draft is then saved so a real list row exists for the
 * row-delete half of the flow.
 */
test.describe('Playlist duplicates + delete', () => {
  test('confirms a duplicate add, removes an item, deletes the playlist', async ({
    userPage,
  }, testInfo) => {
    const title = `Dup Mix ${testInfo.retry}-${Date.now()}`;
    const playlists = new PlaylistsPage(userPage);
    await playlists.goto();

    // First add — cancel the auto-opened save dialog; the item stays staged.
    await playlists.search(TRACK_GAMMA);
    await playlists.addSongResult(TRACK_GAMMA);
    const saveDialog = playlists.saveDialog('create');
    await expect(saveDialog).toBeVisible();
    await saveDialog.getByRole('button', { name: 'Cancel' }).click();
    await expect(saveDialog).toBeHidden();
    await expect(playlists.creatorItemByTitle(TRACK_GAMMA)).toHaveCount(1);

    // Same track again → duplicate confirm → "Add again" → two creator items.
    await playlists.addSongResult(TRACK_GAMMA);
    const duplicateDialog = userPage.getByRole('alertdialog', { name: 'Already in playlist' });
    await expect(duplicateDialog).toBeVisible();
    await duplicateDialog.getByRole('button', { name: 'Add again' }).click();
    await expect(playlists.creatorItemByTitle(TRACK_GAMMA)).toHaveCount(2);

    // Trash one creator item → confirm → back to one.
    await userPage
      .getByRole('button', { name: `Remove ${TRACK_GAMMA}` })
      .first()
      .click();
    const removeDialog = userPage.getByRole('alertdialog', { name: 'Remove from playlist?' });
    await expect(removeDialog).toBeVisible();
    await removeDialog.getByRole('button', { name: 'Remove', exact: true }).click();
    await expect(playlists.creatorItemByTitle(TRACK_GAMMA)).toHaveCount(1);

    // Save the draft so the playlist exists as a list row.
    await userPage.getByRole('button', { name: 'Save playlist' }).click();
    await expect(saveDialog).toBeVisible();
    await playlists.submitSaveDialog(saveDialog, title);
    const row = playlists.rowByTitle(title);
    await expect(row).toBeVisible();

    // Delete the playlist row → confirm → the row is gone.
    await row.getByRole('button', { name: 'Delete playlist' }).click();
    const deleteDialog = userPage.getByRole('alertdialog', { name: `Delete "${title}"?` });
    await expect(deleteDialog).toBeVisible();
    await deleteDialog.getByRole('button', { name: 'Delete', exact: true }).click();

    await expect(row).toHaveCount(0);
  });
});
