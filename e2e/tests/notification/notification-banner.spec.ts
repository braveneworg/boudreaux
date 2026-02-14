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

    const tablist = page.getByRole('tablist', { name: 'Banner navigation' });
    await expect(tablist).toBeVisible();

    // We seeded 3 banners, so expect 3 dots
    const tabs = tablist.getByRole('tab');
    await expect(tabs).toHaveCount(3);

    // First dot should be selected
    await expect(tabs.first()).toHaveAttribute('aria-selected', 'true');
  });

  test('should navigate to a specific banner when clicking a dot', async ({ page }) => {
    await page.goto('/');

    const tabs = page.getByRole('tab');

    // Click the second dot
    await tabs.nth(1).click();

    // Second dot should now be selected
    await expect(tabs.nth(1)).toHaveAttribute('aria-selected', 'true');
    await expect(tabs.first()).toHaveAttribute('aria-selected', 'false');
  });

  test('should support keyboard navigation with arrow keys', async ({ page }) => {
    await page.goto('/');

    const carousel = page.locator('[aria-roledescription="carousel"]');
    await carousel.focus();

    // Press right arrow to go to next banner
    await carousel.press('ArrowRight');

    // Second dot should now be selected
    const tabs = page.getByRole('tab');
    await expect(tabs.nth(1)).toHaveAttribute('aria-selected', 'true');
  });

  test('should auto-cycle to next banner after interval', async ({ page }) => {
    await page.goto('/');

    // Verify first dot is selected
    const tabs = page.getByRole('tab');
    await expect(tabs.first()).toHaveAttribute('aria-selected', 'true');

    // Wait for auto-cycle (6500ms interval + buffer)
    await page.waitForTimeout(7_500);

    // Should have moved to the second banner
    await expect(tabs.nth(1)).toHaveAttribute('aria-selected', 'true');
  });

  test('should pause auto-cycling on hover', async ({ page }) => {
    await page.goto('/');

    const carousel = page.locator('[aria-roledescription="carousel"]');
    const tabs = page.getByRole('tab');

    await expect(tabs.first()).toHaveAttribute('aria-selected', 'true');

    // Hover over the carousel to pause
    await carousel.hover();

    // Wait longer than the auto-cycle interval
    await page.waitForTimeout(8_000);

    // Should still be on first banner because hovering pauses cycling
    await expect(tabs.first()).toHaveAttribute('aria-selected', 'true');
  });

  test('should wrap around when navigating past the last banner', async ({ page }) => {
    await page.goto('/');

    const carousel = page.locator('[aria-roledescription="carousel"]');
    const tabs = page.getByRole('tab');

    await carousel.focus();

    // Navigate to last banner (3 banners, start at 0, go right twice)
    await carousel.press('ArrowRight');
    await carousel.press('ArrowRight');
    await expect(tabs.nth(2)).toHaveAttribute('aria-selected', 'true');

    // Navigate one more time to wrap around to first
    await carousel.press('ArrowRight');
    await expect(tabs.first()).toHaveAttribute('aria-selected', 'true');
  });
});
