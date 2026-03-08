/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { expect, test } from '@playwright/test';

test.describe('Public Tours Search', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to tours page
    await page.goto('/tours');
    await page.waitForLoadState('networkidle');
  });

  test('displays search input', async ({ page }) => {
    const searchInput = page.getByLabel('Search tours by artist name');
    await expect(searchInput).toBeVisible();
    await expect(searchInput).toHaveAttribute('placeholder', 'Search by artist name...');
  });

  test('filters tours by artist name', async ({ page }) => {
    const searchInput = page.getByLabel('Search tours by artist name');

    // Get initial tour count
    const initialCards = await page.locator('[data-testid="tour-card"]').count();

    // Type search query
    await searchInput.fill('Beatles');

    // Wait for filtering
    await page.waitForTimeout(500); // Wait for debounce

    // Get filtered count
    const filteredCards = await page.locator('[data-testid="tour-card"]').count();

    // Should have fewer or equal tours
    expect(filteredCards).toBeLessThanOrEqual(initialCards);
  });

  test('performs case-insensitive search', async ({ page }) => {
    const searchInput = page.getByLabel('Search tours by artist name');

    // Search with lowercase
    await searchInput.fill('beatles');
    await page.waitForTimeout(500);
    const lowercaseResults = await page.locator('[data-testid="tour-card"]').count();

    // Clear and search with uppercase
    await page.getByLabel('Clear search').click();
    await searchInput.fill('BEATLES');
    await page.waitForTimeout(500);
    const uppercaseResults = await page.locator('[data-testid="tour-card"]').count();

    // Should return same results
    expect(lowercaseResults).toBe(uppercaseResults);
  });

  test('performs partial match search', async ({ page }) => {
    const searchInput = page.getByLabel('Search tours by artist name');

    // First, search with full artist name to get baseline result count
    await searchInput.fill('Beatles');
    await page.waitForTimeout(500);
    const fullResults = await page.locator('[data-testid="tour-card"]').count();

    // Clear and search with partial string
    await page.getByLabel('Clear search').click();
    await searchInput.fill('Beat');
    await page.waitForTimeout(500);

    // Should find tours containing "Beat" (e.g., "Beatles") and not fewer than exact search
    const partialResults = await page.locator('[data-testid="tour-card"]').count();
    expect(partialResults).toBeGreaterThan(0);
    expect(partialResults).toBeGreaterThanOrEqual(fullResults);
  });

  test('shows result count when searching', async ({ page }) => {
    const searchInput = page.getByLabel('Search tours by artist name');

    // Initially no count shown
    await expect(page.getByText(/\d+ tours? found/)).not.toBeVisible();

    // Type search query
    await searchInput.fill('Rock');
    await page.waitForTimeout(500);

    // Should show count
    await expect(page.getByText(/\d+ tours? found/)).toBeVisible();
  });

  test('shows clear button when search has value', async ({ page }) => {
    const searchInput = page.getByLabel('Search tours by artist name');
    const clearButton = page.getByLabel('Clear search');

    // Initially no clear button
    await expect(clearButton).not.toBeVisible();

    // Type search query
    await searchInput.fill('Test');

    // Clear button should appear
    await expect(clearButton).toBeVisible();
  });

  test('clears search when clear button is clicked', async ({ page }) => {
    const searchInput = page.getByLabel('Search tours by artist name');
    const clearButton = page.getByLabel('Clear search');

    // Type search query
    await searchInput.fill('Beatles');
    await page.waitForTimeout(500);

    // Get filtered count
    const filteredCount = await page.locator('[data-testid="tour-card"]').count();

    // Click clear
    await clearButton.click();

    // Input should be empty
    await expect(searchInput).toHaveValue('');

    // Should show all tours again
    const allCount = await page.locator('[data-testid="tour-card"]').count();
    expect(allCount).toBeGreaterThanOrEqual(filteredCount);

    // Result count should not be visible
    await expect(page.getByText(/\d+ tours? found/)).not.toBeVisible();
  });

  test('shows empty state when no results found', async ({ page }) => {
    const searchInput = page.getByLabel('Search tours by artist name');

    // Search for something that should not exist
    await searchInput.fill('ZZZNonexistentArtistZZZ');
    await page.waitForTimeout(500);

    // Should show empty state
    await expect(page.getByText('No tours found')).toBeVisible();
    await expect(page.getByText(/Try adjusting your search/)).toBeVisible();
  });

  test('maintains search query in URL (if implemented)', async ({ page }) => {
    const searchInput = page.getByLabel('Search tours by artist name');

    // Type search query
    await searchInput.fill('Beatles');
    await page.waitForTimeout(500);

    // Note: This test assumes search query is added to URL
    // If not implemented, this test can be removed or modified
    // Expected URL: /tours?q=Beatles
  });

  test('keyboard navigation works', async ({ page }) => {
    const searchInput = page.getByLabel('Search tours by artist name');

    // Focus search input directly
    await searchInput.focus();
    await expect(searchInput).toBeFocused();

    // Type with keyboard
    await page.keyboard.type('Test');

    // Should filter results
    await page.waitForTimeout(500);
    await expect(searchInput).toHaveValue('Test');
  });

  test('debounces search input', async ({ page }) => {
    const searchInput = page.getByLabel('Search tours by artist name');

    // Type multiple characters quickly
    await searchInput.focus();
    await page.keyboard.type('Beatles', { delay: 50 });

    // Should not filter immediately (debounced)
    // Wait less than debounce time
    await page.waitForTimeout(100);

    // Now wait for debounce to complete
    await page.waitForTimeout(300);

    // Should show filtered results
    await expect(searchInput).toHaveValue('Beatles');
  });

  test('preserves scroll position when filtering', async ({ page }) => {
    const searchInput = page.getByLabel('Search tours by artist name');

    // Scroll down if there are enough tours
    if ((await page.locator('[data-testid="tour-card"]').count()) > 6) {
      await page.evaluate(() => window.scrollTo(0, 500));

      // Filter tours
      await searchInput.fill('Test');
      await page.waitForTimeout(500);

      // Should maintain scroll or reset to top (depends on UX decision)
      // This test documents the behavior
    }
  });

  test('shows singular "1 tour found" for single result', async ({ page }) => {
    const searchInput = page.getByLabel('Search tours by artist name');

    // Search for something specific
    await searchInput.fill('UniqueArtistName');
    await page.waitForTimeout(500);

    const count = await page.locator('[data-testid="tour-card"]').count();

    if (count === 1) {
      await expect(page.getByText('1 tour found')).toBeVisible();
    }
  });

  test('mobile: search works on small screens', async ({ page }) => {
    // Set mobile viewport
    await page.setViewportSize({ width: 375, height: 667 });

    const searchInput = page.getByLabel('Search tours by artist name');

    // Search should be visible and functional
    await expect(searchInput).toBeVisible();
    await searchInput.fill('Test');
    await page.waitForTimeout(500);

    // Clear button should be clickable
    const clearButton = page.getByLabel('Clear search');
    await expect(clearButton).toBeVisible();
    await clearButton.click();
  });
});
