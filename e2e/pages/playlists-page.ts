/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { expect } from '@playwright/test';

import type { Locator, Page } from '@playwright/test';

/**
 * Page object for the signed-in `/playlists` page (left-pane creator beside
 * the My Playlists list). Locators are role-scoped and every composite action
 * ends on a web-first assertion so specs stay deterministic and parallel-safe
 * (all playlist specs share the same fixture user — callers scope every row
 * assertion by a spec-unique playlist title).
 */
export class PlaylistsPage {
  readonly page: Page;
  /** The creator's media-search combobox input (cmdk `CommandInput`). */
  readonly searchInput: Locator;
  /** All rows of the creator's drag-sortable item list. */
  readonly creatorItems: Locator;

  constructor(page: Page) {
    this.page = page;
    this.searchInput = page.getByRole('combobox', { name: 'Search songs and videos' });
    this.creatorItems = page.getByRole('list', { name: 'Playlist items' }).getByRole('listitem');
  }

  /** Open `/playlists` and wait for the page heading. */
  async goto(): Promise<void> {
    await this.page.goto('/playlists');
    await expect(this.page.getByRole('heading', { level: 1, name: 'My Playlists' })).toBeVisible();
  }

  /** Type a media-search query (the creator debounces it into the API). */
  async search(query: string): Promise<void> {
    await this.searchInput.fill(query);
  }

  /** A search-result option scoped to its group heading (cmdk group). */
  searchOption(groupLabel: string, text: string): Locator {
    return this.page
      .getByRole('group', { name: groupLabel })
      .getByRole('option')
      .filter({ hasText: text });
  }

  /** Click the Songs-group result for `title` (stages/adds it). */
  async addSongResult(title: string): Promise<void> {
    const option = this.searchOption('Songs', title);
    await expect(option).toBeVisible();
    await option.click();
  }

  /** Click the Videos-group result for `title` (stages/adds it). */
  async addVideoResult(title: string): Promise<void> {
    const option = this.searchOption('Videos', title);
    await expect(option).toBeVisible();
    await option.click();
  }

  /** The row's play-button, scoped by the row's unique title. */
  rowPlayButton(title: string): Locator {
    return this.rowByTitle(title).getByRole('button', { name: 'Play playlist' });
  }

  /** The row's share-button, scoped by the row's unique title. */
  rowShareButton(title: string): Locator {
    return this.rowByTitle(title).getByRole('button', { name: 'Share playlist' });
  }

  /** The share popover (Radix popover content renders role="dialog"). */
  sharePopover(): Locator {
    return this.page.getByRole('dialog', { name: 'Share playlist' });
  }

  /** The player dialog, disambiguated by the playlist title it displays. */
  playerDialog(title: string): Locator {
    return this.page.getByRole('dialog').filter({ hasText: title });
  }

  /**
   * Resolve a playlist's id by its spec-unique title via the authenticated
   * list API (page.request shares the fixture session cookies). Reads the
   * first page — per-run playlist volume stays far below PLAYLISTS_PAGE_SIZE.
   */
  async playlistIdByTitle(title: string): Promise<string> {
    const response = await this.page.request.get('/api/playlists?skip=0&take=24');
    expect(response.ok()).toBe(true);
    const body = (await response.json()) as { rows: Array<{ id: string; title: string }> };
    const row = body.rows.find((r) => r.title === title);
    if (!row) throw new Error(`Playlist not found in first page: ${title}`);
    return row.id;
  }

  /** The save dialog — named `New playlist` (create) or `Edit playlist` (edit). */
  saveDialog(mode: 'create' | 'edit'): Locator {
    return this.page.getByRole('dialog', {
      name: mode === 'create' ? 'New playlist' : 'Edit playlist',
    });
  }

  /** Fill the title and submit the save dialog, waiting for it to close. */
  async submitSaveDialog(dialog: Locator, title: string): Promise<void> {
    await dialog.getByLabel('Title').fill(title);
    await dialog.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(dialog).toBeHidden();
  }

  /**
   * A My Playlists row scoped by its spec-unique title. Rows are the only
   * list items carrying a "Delete playlist" button, which disambiguates them
   * from creator item rows and from Sonner toast `<li>` elements.
   */
  rowByTitle(title: string): Locator {
    return this.page
      .getByRole('listitem')
      .filter({ hasText: title })
      .filter({ has: this.page.getByRole('button', { name: 'Delete playlist' }) });
  }

  /** Creator item rows whose title matches (may be several for duplicates). */
  creatorItemByTitle(title: string): Locator {
    return this.creatorItems.filter({ hasText: title });
  }

  /**
   * Create a playlist through the UI: the FIRST added item of a draft session
   * auto-opens the save dialog, which this fills and submits, then waits for
   * the new row to appear in the My Playlists list. `makePublic` toggles the
   * dialog's public switch before saving (existing callers stay untouched).
   */
  async createPlaylistWithFirstTrack(
    trackTitle: string,
    playlistTitle: string,
    { makePublic = false }: { makePublic?: boolean } = {}
  ): Promise<void> {
    await this.search(trackTitle);
    await this.addSongResult(trackTitle);
    const dialog = this.saveDialog('create');
    await expect(dialog).toBeVisible();
    await dialog.getByLabel('Title').fill(playlistTitle);
    if (makePublic) {
      const publicSwitch = dialog.getByRole('switch', { name: 'Public playlist' });
      await publicSwitch.click();
      await expect(publicSwitch).toHaveAttribute('aria-checked', 'true');
    }
    await dialog.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(dialog).toBeHidden();
    await expect(this.rowByTitle(playlistTitle)).toBeVisible();
  }
}
