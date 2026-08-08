/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { expect, test } from '../fixtures/auth.fixture';

import type { Locator, Page } from '@playwright/test';

/**
 * E2E coverage for the public `/videos` listing (Task 12). The page needs no
 * sign-in; the signed-in describe block below just reuses the session fixture.
 *
 * Asserts against the deterministic seed (e2e/helpers/seed-test-db.ts): 7
 * PUBLISHED videos newest→oldest by `releasedOn` — Alpha (2026-01-07) → Bravo →
 * Charlie → Delta → Echo → Foxtrot → Golf (2026-01-01) — plus a DRAFT and an
 * ARCHIVED video that must never surface here. Page size is 5, so page 1 is
 * Alpha..Echo and infinite scroll pulls in Foxtrot + Golf.
 *
 * Read-only: these specs never mutate the shared seed, so they stay parallel-safe.
 */

/** The 5 newest published titles rendered on page 1 (newest-first default). */
const PAGE_ONE_TITLES = [
  'E2E Video Alpha',
  'E2E Video Bravo',
  'E2E Video Charlie',
  'E2E Video Delta',
  'E2E Video Echo',
] as const;

/** Card titles render as level-2 headings; the page title "Videos" is the lone h1. */
const cardTitles = (page: Page): Locator => page.getByRole('heading', { level: 2 });

/** Scope to a single video card (an <article>) by its title heading. */
const cardByTitle = (page: Page, title: string): Locator =>
  page.getByRole('article').filter({ has: page.getByRole('heading', { level: 2, name: title }) });

test.describe('Videos page — public access', () => {
  test('renders the listing for an anonymous visitor', async ({ page }) => {
    await page.goto('/videos');

    await expect(page.getByRole('heading', { level: 1, name: /videos/i })).toBeVisible();
    const alpha = cardByTitle(page, 'E2E Video Alpha');
    await expect(alpha).toHaveCount(1);
    await expect(alpha.getByRole('button', { name: 'Play E2E Video Alpha' })).toBeVisible();
  });
});

test.describe('Videos page — signed-in listing', () => {
  test('page 1 shows the 5 newest published videos, not the draft or archived', async ({
    userPage,
  }) => {
    await userPage.goto('/videos');

    // Exactly the 5 newest published titles, in order, are on page 1.
    await expect(cardTitles(userPage)).toHaveCount(PAGE_ONE_TITLES.length);
    await expect(cardTitles(userPage)).toHaveText([...PAGE_ONE_TITLES]);

    // The draft and archived videos never appear on the public listing.
    await expect(userPage.getByText('E2E Video Draft')).toHaveCount(0);
    await expect(userPage.getByText('E2E Video Archived')).toHaveCount(0);
    // Foxtrot + Golf are on page 2 — not yet loaded.
    await expect(userPage.getByText('E2E Video Foxtrot')).toHaveCount(0);
    await expect(userPage.getByText('E2E Video Golf')).toHaveCount(0);
  });

  test('a card renders its title, artist, labeled date, duration, and description', async ({
    userPage,
  }) => {
    await userPage.goto('/videos');

    const alpha = cardByTitle(userPage, 'E2E Video Alpha');
    await expect(alpha).toHaveCount(1);

    await expect(alpha.getByText('E2E Artist One')).toBeVisible();
    await expect(alpha.getByText('Release date:')).toBeVisible();
    // The formatted release date renders as "MMM D, 2026"; assert the shape,
    // not the exact day, since toLocaleDateString depends on the runner's TZ.
    await expect(alpha.getByText(/[A-Z][a-z]{2} \d{1,2}, 2026/)).toBeVisible();
    // 125s → "2:05" (timezone-independent, unlike the release date).
    await expect(alpha.getByText('Duration:')).toBeVisible();
    await expect(alpha.getByText('2:05')).toBeVisible();
    await expect(alpha.getByText('E2E Video Alpha description for E2E.')).toBeVisible();

    // Category labels are gone from the public listing.
    await expect(alpha.getByText('Music', { exact: true })).toHaveCount(0);
    await expect(
      cardByTitle(userPage, 'E2E Video Bravo').getByText('Informational', { exact: true })
    ).toHaveCount(0);
  });

  test('clicking the poster opens the modal player and mounts the video.js surface', async ({
    userPage,
  }) => {
    await userPage.goto('/videos');

    const alpha = cardByTitle(userPage, 'E2E Video Alpha');
    await expect(alpha).toHaveCount(1);

    const play = alpha.getByRole('button', { name: 'Play E2E Video Alpha' });
    const dialog = userPage.getByRole('dialog', { name: 'E2E Video Alpha' });
    // Nothing from the modal or video.js exists until the poster is pressed.
    await expect(play).toBeVisible();
    await expect(dialog).toHaveCount(0);
    await expect(userPage.locator('.video-js')).toHaveCount(0);

    await play.click();

    // The modal opens and mounts the lazily-imported video.js surface. Whether
    // the H.264 fixture then decodes depends on the Chromium build's codec
    // support: builds without it (e.g. macOS Playwright) reach the surface's
    // inline error fallback and video.js tears its element down, while builds
    // with it (CI's Linux Chromium) render a live `.video-js` player. The two
    // terminal states are mutually exclusive; either one proves the lazy
    // surface mounted and ran video.js.
    await expect(dialog).toBeVisible();
    const surfaceError = dialog.getByText(/This video can.t be played right now\./);
    await expect(surfaceError.or(dialog.locator('.video-js'))).toBeVisible({ timeout: 15_000 });

    // Closing the modal unmounts the surface and disposes the player.
    await dialog.getByRole('button', { name: 'Close' }).click();
    await expect(dialog).toHaveCount(0);
    await expect(userPage.locator('.video-js')).toHaveCount(0);
  });

  // The search is a combobox: a trigger button opens the dropdown whose input
  // drives both the suggestion list and the listing behind it.
  const openSearch = async (page: Page): Promise<Locator> => {
    await page.getByRole('button', { name: 'Search videos' }).click();
    const input = page.getByPlaceholder('Search by title or artist');
    await expect(input).toBeVisible();
    return input;
  };

  test('searching by title narrows the listing across pages', async ({ userPage }) => {
    await userPage.goto('/videos');

    await expect(cardTitles(userPage)).toHaveCount(PAGE_ONE_TITLES.length);

    // Golf normally sits on page 2 — matching it proves the search is
    // server-side, not a client filter over the loaded rows.
    await (await openSearch(userPage)).fill('Golf');

    await expect(cardTitles(userPage)).toHaveText(['E2E Video Golf']);
  });

  test('searching by artist narrows to that artist and keeps newest-first order', async ({
    userPage,
  }) => {
    await userPage.goto('/videos');

    await (await openSearch(userPage)).fill('E2E Artist Two');

    await expect(cardTitles(userPage)).toHaveText(['E2E Video Bravo', 'E2E Video Echo']);
  });

  test('clearing the search restores the full listing', async ({ userPage }) => {
    await userPage.goto('/videos');

    const search = await openSearch(userPage);
    await search.fill('Golf');
    await expect(cardTitles(userPage)).toHaveText(['E2E Video Golf']);

    await search.fill('');

    await expect(cardTitles(userPage)).toHaveText([...PAGE_ONE_TITLES]);
  });

  test('typing prepopulates the dropdown with the matching videos', async ({ userPage }) => {
    await userPage.goto('/videos');

    await (await openSearch(userPage)).fill('E2E Artist Two');

    // Suggestions carry the artist line; Golf (Artist Three) must not appear.
    const options = userPage.getByRole('option');
    await expect(options).toHaveCount(2);
    await expect(options.filter({ hasText: 'E2E Video Bravo' })).toHaveCount(1);
    await expect(options.filter({ hasText: 'E2E Video Echo' })).toHaveCount(1);
  });

  test('selecting a suggestion opens the modal player', async ({ userPage }) => {
    await userPage.goto('/videos');

    await (await openSearch(userPage)).fill('Golf');
    await userPage.getByRole('option').filter({ hasText: 'E2E Video Golf' }).click();

    const dialog = userPage.getByRole('dialog', { name: 'E2E Video Golf' });
    await expect(dialog).toBeVisible();
    // Whether the H.264 fixture decodes depends on the Chromium build (see the
    // poster-click modal test above) — either terminal state proves the
    // surface mounted for the picked suggestion.
    const surfaceError = dialog.getByText(/This video can.t be played right now\./);
    await expect(surfaceError.or(dialog.locator('.video-js'))).toBeVisible({ timeout: 15_000 });

    await dialog.getByRole('button', { name: 'Close' }).click();
    await expect(dialog).toHaveCount(0);
  });

  test('a search with no matches shows the no-match message', async ({ userPage }) => {
    await userPage.goto('/videos');

    await (await openSearch(userPage)).fill('zzz-no-such-video');

    await expect(userPage.getByText(/No videos match/).first()).toBeVisible();
    await expect(cardTitles(userPage)).toHaveCount(0);
  });

  test('infinite scroll loads Foxtrot and Golf for 7 total cards', async ({ userPage }) => {
    await userPage.goto('/videos');

    await expect(cardTitles(userPage)).toHaveCount(PAGE_ONE_TITLES.length);

    // Bring the end of page 1 into view to trip the IntersectionObserver. Retry
    // the scroll: tripping the observer re-renders the list (appends page 2),
    // which can transiently detach the node a single scrollIntoViewIfNeeded
    // grabbed ("Element is not attached to the DOM"). toPass re-resolves the
    // locator and re-scrolls until it lands.
    await expect(async () => {
      await cardByTitle(userPage, 'E2E Video Echo').scrollIntoViewIfNeeded();
    }).toPass({ timeout: 15_000 });

    await expect(
      userPage.getByRole('heading', { level: 2, name: 'E2E Video Foxtrot' })
    ).toBeVisible();
    await expect(userPage.getByRole('heading', { level: 2, name: 'E2E Video Golf' })).toBeVisible();
    await expect(cardTitles(userPage)).toHaveCount(7);
  });

  test('the sort toggle flips the listing to oldest-first (Golf leads)', async ({ userPage }) => {
    await userPage.goto('/videos');

    // Default newest-first: Alpha leads.
    await expect(cardTitles(userPage).first()).toHaveText('E2E Video Alpha');

    await userPage.getByRole('radio', { name: 'Oldest first' }).click();

    // Oldest-first resets paging to page 1: Golf (2026-01-01) now leads.
    await expect(cardTitles(userPage).first()).toHaveText('E2E Video Golf');
  });
});
