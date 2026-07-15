/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { expect, test } from '../../fixtures/base.fixture';
import { PlaylistsPage } from '../../pages/playlists-page';

const TRACK_ALPHA = 'E2E Track Alpha';
const TRACK_BETA = 'E2E Track Beta';

/**
 * Playlist edit + reorder flow: the row's pencil deep-links `?edit=` into the
 * creator's edit dialog; "Add songs" must close the dialog AND hand focus to
 * the media-search input — the `toBeFocused` canary is the repo's regression
 * net for the Radix focus-scope dedupe gotcha (duplicate @radix-ui instances
 * silently break FocusScope pause/resume and steal this focus). Reordering
 * drags with the dnd-kit POINTER sensor via stepped mouse moves — the
 * keyboard sensor proved nondeterministic in a real browser (see the inline
 * comment at the drag).
 */
test.describe('Playlist edit + reorder', () => {
  test('edit dialog hands focus to search; drag reorder persists', async ({
    userPage,
  }, testInfo) => {
    const title = `Reorder Mix ${testInfo.retry}-${Date.now()}`;
    const playlists = new PlaylistsPage(userPage);
    await playlists.goto();
    await playlists.createPlaylistWithFirstTrack(TRACK_ALPHA, title);

    // Pencil on the row → `?edit=` deep link → edit dialog.
    await playlists.rowByTitle(title).getByRole('button', { name: 'Edit playlist' }).click();
    const dialog = playlists.saveDialog('edit');
    await expect(dialog).toBeVisible();

    // Focus canary (non-negotiable): "Add songs" closes the dialog and must
    // leave the creator's search input focused.
    await dialog.getByRole('button', { name: 'Add songs' }).click();
    await expect(dialog).toBeHidden();
    await expect(playlists.searchInput).toBeFocused();

    // Add a second track through the server mutation, then wait for the
    // invalidation refetch of the playlist detail to settle BEFORE dragging —
    // a refetch landing mid-drag re-renders the sortable list and remeasures
    // the droppables, which silently resets the keyboard drag's over-target.
    const detailRefetched = userPage.waitForResponse(
      (response) =>
        response.request().method() === 'GET' &&
        /^\/api\/playlists\/[a-f0-9]{24}$/.test(new URL(response.url()).pathname)
    );
    await playlists.search(TRACK_BETA);
    await playlists.addSongResult(TRACK_BETA);
    await detailRefetched;
    await expect(playlists.creatorItemByTitle(TRACK_BETA)).toBeVisible();
    await expect(playlists.creatorItems.first()).toContainText(TRACK_ALPHA);

    // Pointer-sensor reorder via mouse steps (the path every real user takes).
    // The keyboard sensor is NOT usable here: in a real browser the sortable
    // shift re-measures droppables mid-drag with their transforms applied, so
    // the drop lands on the dragged item itself (verified 3/3 with document/
    // window keydown probes — the sensor handled the end key but DndContext
    // announced "dropped over droppable area <itself>"), and when the page
    // can scroll, ArrowDown takes the sensor's smooth-scroll early-return and
    // the drop is silently swallowed. Each mouse step below is gated on an
    // observable effect; the drop fires the reorder server action — wait for
    // that POST so the persistence reload can never race the write.
    const handle = userPage.getByRole('button', { name: `Reorder ${TRACK_ALPHA}` });
    const betaRow = playlists.creatorItemByTitle(TRACK_BETA);
    const handleBox = await handle.boundingBox();
    const betaBox = await betaRow.boundingBox();
    if (!handleBox || !betaBox) throw new Error('reorder drag targets not laid out');

    await userPage.mouse.move(
      handleBox.x + handleBox.width / 2,
      handleBox.y + handleBox.height / 2
    );
    await userPage.mouse.down();
    // Clear the PointerSensor's 8px activation constraint, then confirm lift.
    await userPage.mouse.move(
      handleBox.x + handleBox.width / 2,
      handleBox.y + handleBox.height / 2 + 12,
      { steps: 3 }
    );
    await expect(handle).toHaveAttribute('aria-pressed', 'true');
    // Glide to Beta's (pre-drag) center so Alpha's rect covers Beta's slot.
    await userPage.mouse.move(betaBox.x + betaBox.width / 2, betaBox.y + betaBox.height / 2, {
      steps: 10,
    });
    await expect(userPage.getByRole('status')).toContainText('was moved over');
    const reorderPersisted = userPage.waitForResponse(
      (response) =>
        response.request().method() === 'POST' && new URL(response.url()).pathname === '/playlists'
    );
    await userPage.mouse.up();
    const response = await reorderPersisted;
    expect(response.ok()).toBeTruthy();

    // Optimistic order flips immediately.
    await expect(playlists.creatorItems.first()).toContainText(TRACK_BETA);

    // Reload and re-open the playlist: the persisted order must survive.
    await userPage.reload();
    await playlists.rowByTitle(title).getByRole('button', { name: 'Edit playlist' }).click();
    const reopened = playlists.saveDialog('edit');
    await expect(reopened).toBeVisible();
    await reopened.getByRole('button', { name: 'Cancel' }).click();
    await expect(reopened).toBeHidden();

    await expect(playlists.creatorItems.first()).toContainText(TRACK_BETA);
    await expect(playlists.creatorItems.nth(1)).toContainText(TRACK_ALPHA);
  });
});
