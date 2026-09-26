/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { test, expect } from '../../fixtures/base.fixture';
import { scrollToLoad } from '../../helpers/infinite-scroll';

import type { Page } from '@playwright/test';

test.describe('Artist Page', () => {
  test.describe('Release Combobox', () => {
    test('should display the artist page with the release combobox', async ({ page }) => {
      await page.goto('/artists/e2e-artist');

      // The artist name should be visible (use .first() — text appears in breadcrumb and ticker)
      await expect(page.getByText('E2E Artist').first()).toBeVisible({ timeout: 15_000 });

      // The release combobox replaces the old carousel. It can momentarily
      // appear twice during the SSR → client hydration handoff; settle to one
      // before the strict-mode visibility assertion.
      const combobox = page.getByRole('combobox', { name: /select a release by e2e artist/i });
      await expect(combobox).toHaveCount(1, { timeout: 10_000 });
      await expect(combobox).toBeVisible();
    });

    test('should default to the newest release', async ({ page }) => {
      await page.goto('/artists/e2e-artist');

      // Releases are sorted newest-first, so "E2E Album Three" (Sep 2024) shows
      // in the combobox trigger by default.
      const combobox = page.getByRole('combobox', { name: /select a release by e2e artist/i });
      await expect(combobox).toContainText('E2E Album Three', { timeout: 15_000 });
    });

    test('should switch releases via the combobox', async ({ page }) => {
      await page.goto('/artists/e2e-artist');

      const combobox = page.getByRole('combobox', { name: /select a release by e2e artist/i });
      await expect(combobox).toHaveCount(1, { timeout: 10_000 });
      await combobox.click();

      // Selecting an option loads and streams it immediately — verify the track
      // name updates to the chosen release's track.
      await page.getByRole('option', { name: /e2e album two/i }).click();
      await expect(page.getByText('E2E Track Beta')).toBeVisible({ timeout: 5_000 });
    });
  });

  test.describe('Bio surfaces', () => {
    test('should show the short bio and genres, with no link away to a bio page', async ({
      page,
    }) => {
      await page.goto('/artists/e2e-artist');

      await expect(page.getByText(/genre-blurring act/i)).toBeVisible({ timeout: 15_000 });
      await expect(page.getByText('Experimental')).toBeVisible();
      // The biography is on this page now, so nothing links away to it.
      await expect(page.getByRole('link', { name: /read full bio/i })).toHaveCount(0);
    });

    // The seed carries a suggested (isPrimary) portrait and a human-chosen
    // display image; the page shows the chosen one only (ADR-0008).
    test('shows the chosen display image instead of the suggested one', async ({ page }) => {
      await page.goto('/artists/e2e-artist');

      // Scoped to the header's display images: the biography's gallery below
      // carries the images the header does not, the suggested portrait among
      // them, so an unscoped query would match it there.
      const header = page.locator('[data-slot="artist-display-images"]');
      const chosen = header.getByRole('button', {
        name: 'Expand image: E2E Artist chosen portrait',
      });
      await expect(chosen).toHaveCount(1, { timeout: 15_000 });
      await expect(chosen).toBeVisible();
      await expect(
        header.getByRole('button', { name: 'Expand image: E2E Artist portrait' })
      ).toHaveCount(0);
    });

    test('carries the long bio, inline link, and image on the artist page itself', async ({
      page,
    }) => {
      await page.goto('/artists/e2e-artist');

      await expect(page.getByRole('heading', { name: 'Biography' })).toBeVisible({
        timeout: 15_000,
      });
      await expect(page.getByText(/immersive soundscapes/i)).toBeVisible();

      // Links are woven inline in the prose — there is no separate links list
      // section at the bottom of the biography anymore.
      await expect(page.getByRole('heading', { name: 'Links' })).toHaveCount(0);

      // BioHtml maps the inline <a> in the bio body to a hardened Next Link with
      // a trailing open-in-new-tab icon (aria-hidden, so the name is unchanged).
      const inlineLink = page.getByRole('link', { name: 'inline link' });
      await expect(inlineLink).toBeVisible();
      await expect(inlineLink).toHaveAttribute('rel', 'nofollow noopener noreferrer');
      await expect(inlineLink).toHaveAttribute('target', '_blank');
      await expect(inlineLink.locator('svg')).toBeVisible();

      // BioHtml maps the inline CDN <img> to a Next Image whose srcset uses the
      // `_w{width}` variant convention (custom CDN loader, no `unoptimized`).
      const inlineImage = page.getByRole('img', { name: 'E2E inline bio image' });
      await expect(inlineImage).toHaveAttribute('srcset', /_w\d+/);
    });

    test('permanently redirects the old /bio URL to the artist page', async ({ page }) => {
      await page.goto('/artists/e2e-artist/bio');

      await expect(page).toHaveURL(/\/artists\/e2e-artist$/, { timeout: 15_000 });
      await expect(page.getByRole('heading', { name: 'Biography' })).toBeVisible();
    });
  });

  test.describe('Artists index', () => {
    /** Open the search combobox and return its typing input (never `.fill()` the trigger). */
    const openSearch = async (page: Page) => {
      await page.getByRole('button', { name: 'Search artists' }).click();
      return page.getByPlaceholder('Search by name, genre, or release');
    };

    /** The artist cards currently in the grid. */
    const cards = (page: Page) => page.locator('[data-slot="card"]');

    test('lists the artist with a short bio and a card link to the detail page', async ({
      page,
    }) => {
      await page.goto('/artists');

      await expect(page.getByRole('heading', { name: 'Artists', level: 1 })).toBeVisible({
        timeout: 15_000,
      });
      await expect(page.getByText(/genre-blurring act/i)).toBeVisible();

      // The name is its own link now — the card surface is inert.
      await page.getByRole('link', { name: 'E2E Artist', exact: true }).click();
      await expect(page).toHaveURL(/\/artists\/e2e-artist$/);
    });

    test('the card shows the chosen display image instead of the suggested one', async ({
      page,
    }) => {
      await page.goto('/artists');

      await expect(page.getByRole('heading', { name: 'Artists', level: 1 })).toBeVisible({
        timeout: 15_000,
      });
      // The card's images link to the artist page rather than opening a
      // dialog, so the chosen row is asserted through the rendered <img>.
      const card = cards(page).filter({ hasText: 'E2E Artist' }).first();
      await expect(card.getByRole('img', { name: 'E2E Artist chosen portrait' })).toBeVisible();
      await expect(card.getByRole('img', { name: 'E2E Artist portrait' })).toHaveCount(0);
    });

    test('prepopulates the search dropdown with the first eight artists', async ({ page }) => {
      await page.goto('/artists');
      await expect(cards(page).first()).toBeVisible({ timeout: 15_000 });

      await openSearch(page);

      await expect(page.getByRole('option')).toHaveCount(8);
      await expect(page.getByRole('option').first()).toContainText('E2E Artist');
    });

    test('narrows the grid and the dropdown by release title as the user types', async ({
      page,
    }) => {
      await page.goto('/artists');
      await expect(cards(page).first()).toBeVisible({ timeout: 15_000 });

      await (await openSearch(page)).fill('Album Three');

      await expect(page.getByRole('option')).toHaveCount(1, { timeout: 10_000 });
      await expect(page.getByRole('option')).toContainText('E2E Artist');
      await expect(cards(page)).toHaveCount(1);
    });

    test('matches artists by genre', async ({ page }) => {
      await page.goto('/artists');
      await expect(cards(page).first()).toBeVisible({ timeout: 15_000 });

      await (await openSearch(page)).fill('Punk');

      await expect(page.getByRole('option')).toHaveCount(1, { timeout: 10_000 });
      await expect(page.getByRole('option')).toContainText('E2E Band');
    });

    test('finds an artist beyond the first page (search runs server-side)', async ({ page }) => {
      await page.goto('/artists');
      await expect(cards(page).first()).toBeVisible({ timeout: 15_000 });

      await (await openSearch(page)).fill('Roster 25');

      await expect(page.getByRole('option')).toHaveCount(1, { timeout: 10_000 });
      await expect(page.getByRole('option')).toContainText('E2E Roster 25');
    });

    test('selecting a suggestion fills the field and narrows the grid without navigating', async ({
      page,
    }) => {
      await page.goto('/artists');
      await expect(cards(page).first()).toBeVisible({ timeout: 15_000 });

      await (await openSearch(page)).fill('E2E Band');
      await page.getByRole('option', { name: /E2E Band/ }).click();

      await expect(page.getByRole('button', { name: 'Search artists' })).toHaveText(/E2E Band/);
      await expect(page).toHaveURL(/\/artists$/);
      await expect(cards(page)).toHaveCount(1, { timeout: 10_000 });
      await expect(cards(page).first()).toContainText('E2E Band');
    });

    test('selecting an artist whose name is composed from its parts keeps them in the grid', async ({
      page,
    }) => {
      await page.goto('/artists');
      await expect(cards(page).first()).toBeVisible({ timeout: 15_000 });

      // No stored displayName: the suggestion types "Prof. Quillon M. Tokensmith
      // Jr." into the field, a string no single searched field contains.
      await (await openSearch(page)).fill('Tokensmith');
      await page.getByRole('option', { name: /Tokensmith/ }).click();

      await expect(page.getByRole('button', { name: 'Search artists' })).toHaveText(
        'Prof. Quillon M. Tokensmith Jr.'
      );
      await expect(cards(page)).toHaveCount(1, { timeout: 10_000 });
      await expect(cards(page).first()).toContainText('Tokensmith');
    });

    test('matches a multi-word query whose words live in different fields', async ({ page }) => {
      await page.goto('/artists');
      await expect(cards(page).first()).toBeVisible({ timeout: 15_000 });

      // "Quillon" is the first name, "Roster" only appears in the release title.
      await (await openSearch(page)).fill('quillon roster');

      await expect(page.getByRole('option')).toHaveCount(1, { timeout: 10_000 });
      await expect(page.getByRole('option')).toContainText('Tokensmith');
      await expect(cards(page)).toHaveCount(1);
    });

    test('shows release credits and active years on the cards, and no band lines', async ({
      page,
    }) => {
      await page.goto('/artists');

      // Band relationships no longer render at all — neither "Member of" nor
      // the roster — so the release credit identifies the artist's card.
      const artistCard = cards(page).filter({ hasText: 'E2E Album Three' });
      await expect(artistCard).toHaveCount(1, { timeout: 15_000 });
      await expect(artistCard).toContainText('Latest: E2E Album Three (2024)');
      await expect(artistCard).not.toContainText('Member of');

      // A band's roster no longer renders on the card — only what an act
      // belongs to — so the formation year is what identifies the band card.
      const bandCard = cards(page).filter({ hasText: 'Formed 2010' });
      await expect(bandCard).toHaveCount(1);
      await expect(bandCard).not.toContainText('Members:');
      await expect(bandCard).toContainText('Latest: E2E Band Single (2025)');
    });

    test('sorts A–Z by default and by newest release on demand', async ({ page }) => {
      await page.goto('/artists');
      await expect(cards(page).first()).toContainText('E2E Artist', { timeout: 15_000 });

      await page.getByRole('radio', { name: 'Newest release' }).click();

      await expect(cards(page).first()).toContainText('E2E Band', { timeout: 10_000 });
    });

    test('loads the second page on scroll', async ({ page }) => {
      await page.goto('/artists');
      await expect(cards(page).first()).toBeVisible({ timeout: 15_000 });
      await expect(page.getByText('E2E Roster 25')).toHaveCount(0);

      await scrollToLoad(page, page.getByRole('link', { name: 'E2E Roster 25', exact: true }));
    });

    test('files an artist without a stored display name under their composed name', async ({
      page,
    }) => {
      await page.goto('/artists');
      await expect(cards(page).first()).toBeVisible({ timeout: 15_000 });

      // "Prof. Quillon M. Tokensmith Jr." sorts under P — after every E2E row,
      // so it arrives with the last page and closes the grid. Matched exactly:
      // the card's image link is labelled "<name> artist page", so a loose
      // /Tokensmith/ resolves to two links and trips strict mode.
      await scrollToLoad(
        page,
        page.getByRole('link', { name: 'Prof. Quillon M. Tokensmith Jr.', exact: true })
      );

      await expect(cards(page).last()).toContainText('Tokensmith');
    });

    test('lists current artists by default and alumni on demand', async ({ page }) => {
      await page.goto('/artists');
      await expect(cards(page).first()).toContainText('E2E Artist', { timeout: 15_000 });

      // E2E Alumnus is deactivated with a departure date: never on the
      // default (Current) roster.
      await expect(page.getByRole('radio', { name: 'Current' })).toHaveAttribute(
        'aria-checked',
        'true'
      );
      await expect(page.getByRole('link', { name: 'E2E Alumnus', exact: true })).toHaveCount(0);

      await page.getByRole('radio', { name: 'Alumni' }).click();

      await expect(cards(page)).toHaveCount(1, { timeout: 10_000 });
      await expect(cards(page).first()).toContainText('E2E Alumnus');
    });

    test('lists alumni alongside current artists under All', async ({ page }) => {
      await page.goto('/artists');
      await expect(cards(page).first()).toContainText('E2E Artist', { timeout: 15_000 });

      await page.getByRole('radio', { name: 'All', exact: true }).click();

      // A–Z: "E2E Alumnus" files just ahead of "E2E Artist".
      await expect(cards(page).first()).toContainText('E2E Alumnus', { timeout: 10_000 });
      await expect(cards(page).nth(1)).toContainText('E2E Artist');
    });

    test('an alumni card links through to the artist page', async ({ page }) => {
      await page.goto('/artists');
      await expect(cards(page).first()).toBeVisible({ timeout: 15_000 });

      await page.getByRole('radio', { name: 'Alumni' }).click();
      await page.getByRole('link', { name: 'E2E Alumnus', exact: true }).click();

      await expect(page).toHaveURL(/\/artists\/e2e-alumnus$/);
      await expect(page.getByText('E2E Alumnus').first()).toBeVisible({ timeout: 15_000 });
    });

    test('redirects the retired search page to the index', async ({ page }) => {
      await page.goto('/artists/search');

      await expect(page).toHaveURL(/\/artists$/);
      await expect(page.getByRole('heading', { name: 'Artists', level: 1 })).toBeVisible({
        timeout: 15_000,
      });
    });
  });
});
