/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { expect, test } from '../fixtures/auth.fixture';

import type { Locator, Page } from '@playwright/test';

/**
 * E2E coverage for the signed-in `/videos` listing (Task 12).
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

test.describe('Videos page — auth gate', () => {
  test('redirects an anonymous visitor to sign in with a /videos callbackUrl', async ({ page }) => {
    await page.goto('/videos');

    await page.waitForURL(/\/signin/, { timeout: 10_000 });
    expect(new URL(page.url()).searchParams.get('callbackUrl')).toBe('/videos');
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

  test('a card renders its title, artist, category badge, date, duration, and description', async ({
    userPage,
  }) => {
    await userPage.goto('/videos');

    const alpha = cardByTitle(userPage, 'E2E Video Alpha');
    await expect(alpha).toHaveCount(1);

    await expect(alpha.getByText('E2E Artist One')).toBeVisible();
    await expect(alpha.getByText('Music', { exact: true })).toBeVisible();
    // 125s → "2:05" (timezone-independent, unlike the release date).
    await expect(alpha.getByText('2:05')).toBeVisible();
    await expect(alpha.getByText('E2E Video Alpha description for E2E.')).toBeVisible();
    // The formatted release date renders as "MMM D, 2026"; assert the shape,
    // not the exact day, since toLocaleDateString depends on the runner's TZ.
    await expect(alpha.getByText(/[A-Z][a-z]{2} \d{1,2}, 2026/)).toBeVisible();

    // An INFORMATIONAL video carries the "Informational" badge instead.
    await expect(
      cardByTitle(userPage, 'E2E Video Bravo').getByText('Informational', { exact: true })
    ).toBeVisible();
  });

  test('pressing play swaps the poster facade for the lazy video.js surface', async ({
    userPage,
  }) => {
    await userPage.goto('/videos');

    const alpha = cardByTitle(userPage, 'E2E Video Alpha');
    await expect(alpha).toHaveCount(1);

    const play = alpha.getByRole('button', { name: 'Play E2E Video Alpha' });
    const surfaceError = alpha.getByText(/This video can.t be played right now\./);
    // Nothing from the video.js surface exists until the play facade is pressed.
    await expect(play).toBeVisible();
    await expect(alpha.locator('.video-js')).toHaveCount(0);
    await expect(surfaceError).toHaveCount(0);

    await play.click();

    // The facade is replaced by the lazily-imported video.js surface. Whether
    // the H.264 fixture then decodes depends on the Chromium build's codec
    // support: builds without it (e.g. macOS Playwright) reach the surface's
    // inline error fallback and video.js tears its element down, while builds
    // with it (CI's Linux Chromium) render a live `.video-js` player. The two
    // terminal states are mutually exclusive; either one proves the lazy
    // surface mounted and ran video.js.
    await expect(play).toHaveCount(0);
    await expect(surfaceError.or(alpha.locator('.video-js'))).toBeVisible({ timeout: 15_000 });
  });

  test('infinite scroll loads Foxtrot and Golf for 7 total cards', async ({ userPage }) => {
    await userPage.goto('/videos');

    await expect(cardTitles(userPage)).toHaveCount(PAGE_ONE_TITLES.length);

    // Bring the end of the list into view to trip the IntersectionObserver.
    await cardByTitle(userPage, 'E2E Video Echo').scrollIntoViewIfNeeded();

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
