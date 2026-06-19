/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { test, expect } from '../../fixtures/base.fixture';

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
    test('should show the short bio, genres, and a Read full bio link', async ({ page }) => {
      await page.goto('/artists/e2e-artist');

      await expect(page.getByText(/genre-blurring act/i)).toBeVisible({ timeout: 15_000 });
      await expect(page.getByText('Experimental')).toBeVisible();
      await expect(page.getByRole('link', { name: /read full bio/i })).toBeVisible();
    });

    test('should open the full bio page with the long bio and a nofollow link', async ({
      page,
    }) => {
      await page.goto('/artists/e2e-artist');

      await page.getByRole('link', { name: /read full bio/i }).click();
      await expect(page).toHaveURL(/\/artists\/e2e-artist\/bio$/);

      await expect(page.getByText(/immersive soundscapes/i)).toBeVisible({ timeout: 15_000 });

      const wikiLink = page.getByRole('link', { name: 'Wikipedia' });
      await expect(wikiLink).toBeVisible();
      await expect(wikiLink).toHaveAttribute('rel', 'nofollow noopener noreferrer');
      await expect(wikiLink).toHaveAttribute('target', '_blank');

      // BioHtml maps the inline <a> in the bio body to a hardened Next Link.
      const inlineLink = page.getByRole('link', { name: 'inline link' });
      await expect(inlineLink).toBeVisible();
      await expect(inlineLink).toHaveAttribute('rel', 'nofollow noopener noreferrer');

      // BioHtml maps the inline CDN <img> to a Next Image whose srcset uses the
      // `_w{width}` variant convention (custom CDN loader, no `unoptimized`).
      const inlineImage = page.getByRole('img', { name: 'E2E inline bio image' });
      await expect(inlineImage).toHaveAttribute('srcset', /_w\d+/);
    });
  });

  test.describe('Artists index', () => {
    test('should list the artist with a short bio and View more link', async ({ page }) => {
      await page.goto('/artists');

      await expect(page.getByRole('heading', { name: 'Artists', level: 1 })).toBeVisible({
        timeout: 15_000,
      });
      await expect(page.getByText(/genre-blurring act/i)).toBeVisible();

      // "View more" navigates to the detail page.
      await page
        .getByRole('link', { name: /view more/i })
        .first()
        .click();
      await expect(page).toHaveURL(/\/artists\/e2e-artist$/);
    });
  });
});
