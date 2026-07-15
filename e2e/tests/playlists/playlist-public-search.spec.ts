/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { expect, test } from '../../fixtures/base.fixture';
import { PUBLIC_PLAYLIST_SNAPSHOT_TITLE, PUBLIC_PLAYLIST_TITLE } from '../../helpers/seed-test-db';
import { PlaylistsPage } from '../../pages/playlists-page';

/** Live title of the seeded MP3 file the snapshot re-resolves to. */
const TRACK_ALPHA = 'E2E Track Alpha';

/**
 * Public-playlist media search: the seed gives "User B" (the admin fixture) a
 * PUBLIC playlist whose first item carries the snapshot title
 * "Zebra Crossing Cut" — a token matching no track/release/video/artist — so
 * searching it as the regular user surfaces the item EXCLUSIVELY under the
 * "From public playlists" group. The row displays the LIVE track title
 * (snapshots re-resolve against live rows) with the source playlist title as
 * its context line.
 */
test.describe('Playlist public search', () => {
  test("surfaces another user's public playlist item with its context", async ({ userPage }) => {
    const playlists = new PlaylistsPage(userPage);
    await playlists.goto();

    await playlists.search(PUBLIC_PLAYLIST_SNAPSHOT_TITLE);

    const group = userPage.getByRole('group', { name: 'From public playlists' });
    const option = group.getByRole('option').filter({ hasText: PUBLIC_PLAYLIST_TITLE });
    await expect(option).toBeVisible();
    await expect(option).toContainText(TRACK_ALPHA);

    // The snapshot-only token matches no live source — no Songs group.
    await expect(userPage.getByRole('group', { name: 'Songs', exact: true })).toHaveCount(0);
  });
});
