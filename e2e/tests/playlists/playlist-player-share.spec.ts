/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { expect, test } from '../../fixtures/base.fixture';
import { PlaylistsPage } from '../../pages/playlists-page';

const TRACK_ALPHA = 'E2E Track Alpha';
const VIDEO_ALPHA = 'E2E Video Alpha';

/**
 * PR2 flows: row → player dialog, download preflight (never the full zip —
 * fixture-less S3 aborts streams in CI), share popover (public URL + private
 * make-public swap), and the /playlists/[id] shared page. Titles embed the
 * retry index + a timestamp (unique per owner forever, parallel-safe).
 */
test.describe('Playlist player and share', () => {
  test('opens the player dialog from a row with a mixed queue', async ({ userPage }, testInfo) => {
    const title = `Player Mix ${testInfo.retry}-${Date.now()}`;
    const playlists = new PlaylistsPage(userPage);
    await playlists.goto();
    await playlists.createPlaylistWithFirstTrack(TRACK_ALPHA, title);
    await playlists.search(VIDEO_ALPHA);
    await playlists.addVideoResult(VIDEO_ALPHA);
    await expect(playlists.rowByTitle(title)).toContainText('2 items');

    await playlists.rowPlayButton(title).click();
    const dialog = playlists.playerDialog(title);
    await expect(dialog).toBeVisible();

    // Queue lists both items. Scope to each queue row's play-button
    // (`Play {title}` aria-label): the track title also renders in the info
    // ticker, so a bare getByText would strict-mode-collide across the two.
    await expect(dialog.getByRole('button', { name: `Play ${TRACK_ALPHA}` })).toBeVisible();
    await expect(dialog.getByRole('button', { name: `Play ${VIDEO_ALPHA}` })).toBeVisible();

    // Cover art OR media surface — codec-agnostic terminal state (repo lesson:
    // local macOS Chromium lacks H.264; never assert one terminal path alone).
    await expect(dialog.locator('img').first().or(dialog.locator('video').first())).toBeVisible();
    // Transport controls render.
    await expect(dialog.getByRole('button', { name: /play|pause/i }).first()).toBeVisible();
  });

  test('authorizes a playlist download via preflight', async ({ page, userPage }, testInfo) => {
    const title = `Download Mix ${testInfo.retry}-${Date.now()}`;
    const playlists = new PlaylistsPage(userPage);
    await playlists.goto();
    await playlists.createPlaylistWithFirstTrack(TRACK_ALPHA, title);
    const id = await playlists.playlistIdByTitle(title);

    // Direct authenticated preflight probe — ok:true JSON, no zip stream.
    const preflight = await userPage.request.get(
      `/api/playlists/${id}/download?format=MP3_320KBPS&respond=preflight`
    );
    expect(preflight.ok()).toBe(true);
    expect(await preflight.json()).toMatchObject({ ok: true });

    // Authorization boundary: the same preflight without a session is denied
    // (withAuth). The signed-out `page` fixture's request context has no cookies.
    const anonymous = await page.request.get(
      `/api/playlists/${id}/download?format=MP3_320KBPS&respond=preflight`
    );
    expect(anonymous.status()).toBe(401);

    // UI path from the shared page: the download row's preflight gates the
    // anchor stream. Assert ONLY the preflight response — never waitForResponse
    // the stream itself (free-digital-downloads lesson: fixture-less S3 aborts
    // the zip body mid-stream in CI, hanging anything that awaits it; that
    // spec's anonymous node:http probe does not transfer to this auth-gated
    // route, so the stream assertion is dropped, not emulated).
    await userPage.goto(`/playlists/${id}`);
    await expect(userPage.getByRole('heading', { level: 1, name: title })).toBeVisible();

    const preflightResponse = userPage.waitForResponse(
      (response) =>
        response.url().includes(`/api/playlists/${id}/download`) &&
        response.url().includes('respond=preflight'),
      { timeout: 15_000 }
    );
    await userPage.getByRole('button', { name: 'Download playlist' }).click();
    await userPage.getByRole('button', { name: 'Download MP3' }).click();
    expect((await preflightResponse).ok()).toBe(true);
  });

  test('shares a public playlist with its /playlists/{id} url', async ({ userPage }, testInfo) => {
    const title = `Share Public ${testInfo.retry}-${Date.now()}`;
    const playlists = new PlaylistsPage(userPage);
    await playlists.goto();
    await playlists.createPlaylistWithFirstTrack(TRACK_ALPHA, title, { makePublic: true });
    const id = await playlists.playlistIdByTitle(title);

    await playlists.rowShareButton(title).click();
    const popover = playlists.sharePopover();
    await expect(popover).toBeVisible();
    await expect(popover.getByRole('button', { name: 'Share on Facebook' })).toBeVisible();
    // The SMS anchor carries the encoded share URL — pin it to this playlist.
    // Read the attribute and substring-match (a built RegExp trips the lint's
    // non-literal-regexp rule, and the id is only a fragment of the href).
    const smsHref = await popover.getByLabel('Share via SMS').getAttribute('href');
    expect(smsHref).toContain(`playlists%2F${id}`);
  });

  test('makes a private playlist public from the share popover', async ({ userPage }, testInfo) => {
    const title = `Share Private ${testInfo.retry}-${Date.now()}`;
    const playlists = new PlaylistsPage(userPage);
    await playlists.goto();
    await playlists.createPlaylistWithFirstTrack(TRACK_ALPHA, title);

    await playlists.rowShareButton(title).click();
    const popover = playlists.sharePopover();
    await expect(
      popover.getByText('Only you can see this playlist — make it public to share.')
    ).toBeVisible();

    await popover.getByRole('button', { name: 'Make public' }).click();

    // The mine() invalidation flips isPublic → the widget swaps in live.
    await expect(popover.getByRole('button', { name: 'Share on Facebook' })).toBeVisible();
    await expect(playlists.rowByTitle(title)).toContainText('1 item · Public');
  });

  test('renders the shared page for the owner', async ({ userPage }, testInfo) => {
    const title = `Owner Page ${testInfo.retry}-${Date.now()}`;
    const playlists = new PlaylistsPage(userPage);
    await playlists.goto();
    await playlists.createPlaylistWithFirstTrack(TRACK_ALPHA, title);
    const id = await playlists.playlistIdByTitle(title);

    await userPage.goto(`/playlists/${id}`);

    await expect(userPage.getByRole('heading', { level: 1, name: title })).toBeVisible();
    await expect(userPage.getByRole('link', { name: 'Open in My Playlists' })).toHaveAttribute(
      'href',
      `/playlists?edit=${id}`
    );
    await expect(userPage.getByText(TRACK_ALPHA).first()).toBeVisible();
    // Player surface, codec-agnostic (image fallback OR media element).
    const main = userPage.getByRole('main');
    await expect(main.locator('img').first().or(main.locator('video').first())).toBeVisible();
  });

  test('redirects a signed-out visitor to /signin', async ({ page }) => {
    await page.goto('/playlists/000000000000000000000000');

    await expect(page).toHaveURL(/\/signin/);
  });
});
