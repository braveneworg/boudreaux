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

    // 3 banner notifications are seeded in the database
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
    const tabs = page.getByRole('tab');

    // Focus the carousel — this pauses auto-cycling via onFocus
    await carousel.focus();

    // Determine which tab is currently selected after focus stabilises
    const selectedBefore = await tabs.evaluateAll((tabList) =>
      tabList.findIndex((tab) => tab.getAttribute('aria-selected') === 'true')
    );

    // Press right arrow to advance one slide
    await carousel.press('ArrowRight');

    // The next dot (wrapping around) should now be selected
    const expectedIndex = (selectedBefore + 1) % (await tabs.count());
    await expect(tabs.nth(expectedIndex)).toHaveAttribute('aria-selected', 'true');
  });

  test('should auto-cycle to next banner after interval', async ({ page }) => {
    await page.goto('/');

    // Verify first dot is selected
    const tabs = page.getByRole('tab');
    await expect(tabs.first()).toHaveAttribute('aria-selected', 'true');

    // Wait for auto-cycle with assertion timeout
    // Default rotation interval is 6.5s + 1.5s buffer = 8s timeout
    await expect(tabs.nth(1)).toHaveAttribute('aria-selected', 'true', { timeout: 8000 });
  });

  test('should pause auto-cycling on hover', async ({ page }) => {
    await page.goto('/');

    const carousel = page.locator('[aria-roledescription="carousel"]');
    const tabs = page.getByRole('tab');

    // Wait for initial state to be stable
    await expect(tabs.first()).toHaveAttribute('aria-selected', 'true');

    // Hover over the carousel to pause auto-cycling BEFORE capturing the index
    // to avoid a race where auto-cycle fires between capture and hover
    await carousel.hover();

    // Capture which tab is selected after hovering (paused state)
    const getSelectedIndex = async () => {
      return await tabs.evaluateAll((tabList) => {
        return tabList.findIndex((tab) => tab.getAttribute('aria-selected') === 'true');
      });
    };

    const selectedTab = await getSelectedIndex();

    // Poll for 2 seconds (2x the interval) to ensure the selection doesn't change
    // If auto-cycling were still active, it would have changed after 1 second
    const pollDuration = 2000;
    const pollInterval = 200;
    const iterations = pollDuration / pollInterval;

    for (let i = 0; i < iterations; i++) {
      await page.waitForTimeout(pollInterval);
      const currentSelected = await getSelectedIndex();
      expect(currentSelected).toBe(selectedTab);
    }
  });

  test('should wrap around when navigating past the last banner', async ({ page }) => {
    await page.goto('/');

    const carousel = page.locator('[aria-roledescription="carousel"]');
    const tabs = page.getByRole('tab');
    const totalTabs = await tabs.count();

    // Focus pauses auto-cycling; capture the current index
    await carousel.focus();

    const getSelectedIndex = async () =>
      tabs.evaluateAll((tabList) =>
        tabList.findIndex((tab) => tab.getAttribute('aria-selected') === 'true')
      );

    const startIndex = await getSelectedIndex();

    // Press ArrowRight (totalTabs) times to cycle through all and wrap back to start
    for (let i = 0; i < totalTabs; i++) {
      await carousel.press('ArrowRight');
    }

    // Should be back at the starting index after a full cycle
    await expect(tabs.nth(startIndex)).toHaveAttribute('aria-selected', 'true');
  });
});
