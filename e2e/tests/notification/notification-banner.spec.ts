/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { test, expect } from '@playwright/test';

test.describe('Notification Banner Carousel', () => {
  test('should display the notification banner carousel on home page', async ({ page }) => {
    await page.goto('/');

    const carousel = page.locator('[aria-roledescription="carousel"]');
    await expect(carousel).toBeVisible();

    // First banner should be visible
    const slide = page.locator('[aria-roledescription="slide"]');
    await expect(slide).toBeVisible();
  });

  test('should display navigation dots for multiple banners', async ({ page }) => {
    await page.goto('/');

    const tablist = page.getByRole('tablist', { name: 'Banner slides' });
    await expect(tablist).toBeVisible();

    // The carousel always renders 1 dot per banner slot (5 slots total),
    // regardless of how many notifications are seeded in the database.
    const tabs = tablist.getByRole('tab');
    await expect(tabs).toHaveCount(5);

    // First dot should be selected
    await expect(tabs.first()).toHaveAttribute('aria-selected', 'true');
  });

  test('should navigate to a specific banner when clicking a dot', async ({ page }) => {
    await page.goto('/');

    const tabs = page.getByRole('tab');

    // Clicking a dot resets the rotation timer; retry the click+assert as a
    // unit so a background auto-advance (the carousel never pauses) can't
    // flip the selection out from under the assertion.
    await expect(async () => {
      await tabs.nth(1).click();
      await expect(tabs.nth(1)).toHaveAttribute('aria-selected', 'true', { timeout: 1500 });
      await expect(tabs.first()).toHaveAttribute('aria-selected', 'false', { timeout: 1500 });
    }).toPass({ timeout: 10_000 });
  });

  test('should support keyboard navigation with arrow keys', async ({ page }) => {
    await page.goto('/');

    const carousel = page.locator('[aria-roledescription="carousel"]');
    const tabs = page.getByRole('tab');
    const count = await tabs.count();

    const getSelectedIndex = () =>
      tabs.evaluateAll((tabList) =>
        tabList.findIndex((tab) => tab.getAttribute('aria-selected') === 'true')
      );

    // The carousel auto-rotates continuously (there is no hover/focus pause),
    // so capture-then-press can race a background advance. ArrowRight both
    // advances one slide AND resets the rotation timer, so retry the whole
    // capture+press+assert as a unit: any iteration the timer pre-empts just
    // re-runs against a fresh baseline.
    await expect(async () => {
      const before = await getSelectedIndex();
      await carousel.press('ArrowRight');
      const expectedIndex = (before + 1) % count;
      await expect(tabs.nth(expectedIndex)).toHaveAttribute('aria-selected', 'true', {
        timeout: 1500,
      });
    }).toPass({ timeout: 10_000 });
  });

  test('should auto-cycle to next banner after interval', async ({ page }) => {
    await page.goto('/');

    // Verify first dot is selected
    const tabs = page.getByRole('tab');
    await expect(tabs.first()).toHaveAttribute('aria-selected', 'true');

    // Wait for auto-cycle with assertion timeout. The seed pins the
    // rotation interval to 3s (seed-test-db.ts), so 8s covers the first
    // rotation with generous margin even on a loaded CI shard.
    await expect(tabs.nth(1)).toHaveAttribute('aria-selected', 'true', { timeout: 8000 });
  });

  // NOTE: there is intentionally NO "pause auto-cycling on hover" test.
  // BannerCarousel does not pause rotation on hover or focus (only
  // totalSlides <= 1 stops the timer; isTabVisible merely dims the strip).
  // The former test polled a 2s window inside the 6.5s interval, so it could
  // never observe an advance and passed vacuously regardless of behavior.
  // Pinning the seed interval to 3s surfaced that it asserted a non-feature,
  // so it was removed rather than re-anchored to behavior that does not exist.

  test('renders sanitized banner HTML with hardened link attributes', async ({ page }) => {
    // Slot 4 is seeded with allowed markup (<strong>, <a>) PLUS a raw
    // <script> and a javascript: link written directly to the DB. This
    // asserts the read-boundary sanitizer + addLinkAttributes end-to-end:
    // allowed content renders, hostile content never reaches the DOM.
    await page.goto('/');

    const tabs = page.getByRole('tab');
    const strip = page.locator('.banner-strip-slide', { hasText: 'E2E Linked Banner' });

    // The carousel rotates continuously, so the slot-4 strip is only the
    // active one transiently. Re-click the dot and assert as one retried
    // unit (clicking resets the rotation timer, giving a fresh interval for
    // the assertions); if a background advance pre-empts us, toPass re-clicks.
    await expect(async () => {
      await tabs.nth(3).click();
      await expect(strip).toBeVisible({ timeout: 1500 });

      // Allowed markup survives.
      await expect(strip.locator('strong')).toHaveText('bold', { timeout: 1500 });
      const promoLink = strip.getByRole('link', { name: 'Promo link' });
      await expect(promoLink).toHaveAttribute('href', 'https://example.com/promo');
      await expect(promoLink).toHaveAttribute('target', '_blank');
      await expect(promoLink).toHaveAttribute('rel', 'noopener noreferrer');

      // Hostile markup is stripped: no script element, no javascript: URL.
      await expect(strip.locator('script')).toHaveCount(0);
      const stripHtml = await strip.innerHTML();
      expect(stripHtml).not.toContain('javascript:');
    }).toPass({ timeout: 15_000 });

    // The seeded <script> payload never executed (global, slide-independent).
    const pwned = await page.evaluate(
      () => (globalThis as unknown as Record<string, unknown>).__e2eBannerPwned
    );
    expect(pwned).toBeUndefined();
  });

  test('should wrap around when navigating past the last banner', async ({ page }) => {
    await page.goto('/');

    const carousel = page.locator('[aria-roledescription="carousel"]');
    const tabs = page.getByRole('tab');
    const totalTabs = await tabs.count();

    const getSelectedIndex = async () =>
      tabs.evaluateAll((tabList) =>
        tabList.findIndex((tab) => tab.getAttribute('aria-selected') === 'true')
      );

    // Each ArrowRight resets the rotation timer, so a tight press loop never
    // races a background advance; the only exposure is a stray auto-advance
    // between capturing the start index and the first press. Wrap the whole
    // capture+cycle+assert so that rare interleaving just retries.
    await carousel.focus();
    await expect(async () => {
      const startIndex = await getSelectedIndex();
      // Press ArrowRight totalTabs times to cycle through all and wrap back.
      for (let i = 0; i < totalTabs; i++) {
        await carousel.press('ArrowRight');
      }
      await expect(tabs.nth(startIndex)).toHaveAttribute('aria-selected', 'true', {
        timeout: 1500,
      });
    }).toPass({ timeout: 12_000 });
  });
});
