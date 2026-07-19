/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { PrismaClient } from '@prisma/client';

import { expect, test } from '../../fixtures/base.fixture';
import { PlaylistsPage } from '../../pages/playlists-page';

import type { Locator, Page } from '@playwright/test';

/**
 * PR3 flows: the session-gated "add to a playlist" kebab on the media players
 * (release/artist/featured audio surfaces + the video card). The menu is a Radix
 * Popover holding a playlist picker with an inline "Create playlist" shortcut, a
 * success toast, and a duplicate-confirm dialog.
 *
 * Every test that needs a target playlist CREATES its own (mirroring
 * playlist-create.spec.ts) — the shared seed is never mutated. Playlist titles
 * embed the retry index + a timestamp so titles are unique per owner forever
 * (`@@unique([ownerId, title])`) and parallel CI workers/retries never collide.
 */

const E2E_DATABASE_URL =
  process.env.E2E_DATABASE_URL || 'mongodb://localhost:27018/boudreaux-e2e?replicaSet=rs0';

const prisma = new PrismaClient({ datasourceUrl: E2E_DATABASE_URL });

/** Seeded published release whose player carries the kebab (has an MP3 track). */
const RELEASE_TITLE = 'E2E Album One';
/** The track that plays first on that release — the item added from its player. */
const RELEASE_TRACK_TITLE = 'E2E Track Alpha';
/**
 * A DIFFERENT seeded track (on another release) used to PRE-FILL a target
 * playlist, so adding the release's playing track (`RELEASE_TRACK_TITLE`) from
 * the player is a FRESH add — not an instant duplicate of what the playlist was
 * seeded with.
 */
const SEED_TRACK_TITLE = 'E2E Track Beta';
/** Newest seeded published video — its card carries the kebab. */
const VIDEO_TITLE = 'E2E Video Alpha';

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

/** The kebab trigger — an aria-labelled icon button rendered by DotNavMenu. */
const addToPlaylistTrigger = (scope: Page | Locator): Locator =>
  scope.getByRole('button', { name: 'Add to a playlist' });

/** The picker input inside the open popover (cmdk CommandInput → role combobox). */
const playlistPicker = (page: Page): Locator =>
  page.getByRole('combobox', { name: 'Find a playlist' });

/** A playlist option in the picker, scoped by its spec-unique title. */
const playlistOption = (page: Page, title: string): Locator =>
  page.getByRole('option').filter({ hasText: title });

/**
 * The success toast, scoped to Sonner's `<li data-sonner-toast>` and filtered by
 * the spec-unique playlist title. Scoping to the toast `<li>` (not a bare
 * getByText) sidesteps the known Sonner `<li>` collision AND the "Add" substring
 * clash with the popover's "Add to a playlist" heading — getByText is a
 * case-insensitive substring match, so "Added to …" would otherwise collide.
 * `.first()` because a fresh add and a later forced-duplicate add stack TWO
 * same-titled toasts (Sonner keeps the first ~4s), which would otherwise trip
 * Playwright strict mode ("resolved to 2 elements").
 */
const successToast = (page: Page, title: string): Locator =>
  page.locator('li[data-sonner-toast]').filter({ hasText: title }).first();

/** The seeded video card (an <article>) scoped by its title heading. */
const videoCardByTitle = (page: Page, title: string): Locator =>
  page.getByRole('article').filter({ has: page.getByRole('heading', { level: 2, name: title }) });

/**
 * Regression net for the panel overflowing the popover box (the panel used to
 * hardcode `w-72` inside the `w-72` + `p-4` PopoverContent, so its content
 * poked ~32px past the right border): no descendant of the open popover may
 * extend beyond the popover's own right edge (0.5px subpixel tolerance).
 */
const expectPanelInsidePopover = async (page: Page): Promise<void> => {
  const popover = page.locator('[data-slot="popover-content"]');
  const overflowPx = await popover.evaluate((el) => {
    const { right } = el.getBoundingClientRect();
    const descendants = Array.from(el.querySelectorAll('*'));
    return Math.max(0, ...descendants.map((d) => d.getBoundingClientRect().right - right));
  });
  expect(overflowPx).toBeLessThanOrEqual(0.5);
};

test.describe('Add to a playlist from a player', () => {
  test('hides the kebab from a signed-out visitor on a release page', async ({ page }) => {
    await page.goto(`/releases/${releaseId}`);

    // The player renders for everyone, but the session-gated kebab does not.
    await expect(page.getByRole('heading', { name: /release notes/i })).toBeVisible();
    await expect(addToPlaylistTrigger(page)).toHaveCount(0);
  });

  test('adds the playing track to a playlist, then confirms a duplicate', async ({
    userPage,
  }, testInfo) => {
    const title = `Player Add ${testInfo.retry}-${Date.now()}`;

    // Create the target playlist first (the picker needs an existing one),
    // seeded with a DIFFERENT track than the release's playing track — so the
    // first add from the player is fresh and only the SECOND add is the dup.
    const playlists = new PlaylistsPage(userPage);
    await playlists.goto();
    await playlists.createPlaylistWithFirstTrack(SEED_TRACK_TITLE, title);

    await userPage.goto(`/releases/${releaseId}`);

    // Open the kebab popover.
    await addToPlaylistTrigger(userPage).click();
    const picker = playlistPicker(userPage);
    await expect(picker).toBeVisible();

    // Focus regression net for duplicate @radix-ui/* instances stealing focus
    // from portaled popover content (repo lesson: only an E2E toBeFocused catches
    // it; jsdom unit specs render the popover in isolation and pass). Radix
    // FocusScope autofocuses the picker's CommandInput on open — if a stray Radix
    // FocusScope stole focus to the trigger/body, this fails.
    await expect(picker).toBeFocused();
    await expectPanelInsidePopover(userPage);

    // Pick the playlist → success toast (scoped Sonner locator, not bare text).
    await playlistOption(userPage, title).click();
    await expect(successToast(userPage, title)).toBeVisible();

    // Reopen the kebab and add the SAME track again → duplicate-confirm dialog.
    await addToPlaylistTrigger(userPage).click();
    await expect(playlistPicker(userPage)).toBeVisible();
    await playlistOption(userPage, title).click();

    const duplicateDialog = userPage.getByRole('alertdialog', { name: 'Already in playlist' });
    await expect(duplicateDialog).toBeVisible();
    // "Add again" resolves the confirm and forces the duplicate through.
    await duplicateDialog.getByRole('button', { name: 'Add again' }).click();
    await expect(duplicateDialog).toBeHidden();
    await expect(successToast(userPage, title)).toBeVisible();
  });

  test('creates a new playlist from the player and opens it in My Playlists', async ({
    userPage,
  }, testInfo) => {
    const title = `Player Create ${testInfo.retry}-${Date.now()}`;

    await userPage.goto(`/releases/${releaseId}`);

    // Open the kebab → "Create playlist": the popover closes and the create
    // dialog opens with the playing track already staged.
    await addToPlaylistTrigger(userPage).click();
    await expect(playlistPicker(userPage)).toBeVisible();
    await userPage.getByRole('button', { name: 'Create playlist' }).click();

    const createDialog = userPage.getByRole('dialog', { name: 'Create playlist' });
    await expect(createDialog).toBeVisible();
    // The seeded track is staged in the embedded creator's item list.
    await expect(createDialog.getByText(RELEASE_TRACK_TITLE).first()).toBeVisible();

    // Fill the title and save the new playlist through the inline save form.
    await createDialog.getByLabel('Title').fill(title);
    await createDialog.getByRole('button', { name: 'Save', exact: true }).click();

    // "Open in My Playlists" is an embedded-creator button that deep-links to
    // the saved playlist's edit view.
    await createDialog.getByRole('button', { name: 'Open in My Playlists' }).click();

    // The deep link is consumed and stripped back to /playlists.
    await expect(userPage).toHaveURL(/\/playlists(\?|$)/);

    // `?edit=` opens THIS playlist in the "Edit playlist" save dialog (a modal —
    // so the pane heading/pencil behind it leave the a11y tree). The dialog
    // itself, pre-filled with this playlist's title, is the edit-mode proof
    // (mirrors playlist-edit-reorder.spec.ts).
    const playlists = new PlaylistsPage(userPage);
    const editDialog = playlists.saveDialog('edit');
    await expect(editDialog).toBeVisible();
    await expect(editDialog.getByLabel('Title')).toHaveValue(title);
  });

  test('adds a video to a playlist from its card', async ({ userPage }, testInfo) => {
    const title = `Video Add ${testInfo.retry}-${Date.now()}`;

    // Create the target playlist first, then jump to the video listing.
    const playlists = new PlaylistsPage(userPage);
    await playlists.goto();
    await playlists.createPlaylistWithFirstTrack(RELEASE_TRACK_TITLE, title);

    await userPage.goto('/videos');
    const card = videoCardByTitle(userPage, VIDEO_TITLE);
    await expect(card).toHaveCount(1);

    // Open the card's kebab, assert focus lands in the picker, pick, toast.
    await addToPlaylistTrigger(card).click();
    const picker = playlistPicker(userPage);
    await expect(picker).toBeVisible();
    await expect(picker).toBeFocused();
    await expectPanelInsidePopover(userPage);

    await playlistOption(userPage, title).click();
    await expect(successToast(userPage, title)).toBeVisible();
  });
});
