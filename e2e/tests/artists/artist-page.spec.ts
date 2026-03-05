import { test, expect } from '../../fixtures/base.fixture';

test.describe('Artist Page', () => {
  test.describe('Release Carousel', () => {
    test('should display the artist page with release carousel', async ({ page }) => {
      await page.goto('/artists/e2e-artist');

      // The artist name should be visible
      await expect(page.getByText('E2E Artist')).toBeVisible({ timeout: 15_000 });

      // The carousel should be rendered (aria-label pattern: "Releases by <name>")
      await expect(page.getByLabel(/releases by e2e artist/i)).toBeVisible();
    });

    test('should display release thumbnails in the carousel', async ({ page }) => {
      await page.goto('/artists/e2e-artist');

      await expect(page.getByText('E2E Artist')).toBeVisible({ timeout: 15_000 });

      // Each release should have a thumbnail button in the carousel
      await expect(page.getByRole('button', { name: /play e2e album one/i })).toBeVisible();
      await expect(page.getByRole('button', { name: /play e2e album two/i })).toBeVisible();
      await expect(page.getByRole('button', { name: /play e2e album three/i })).toBeVisible();
    });

    test('should show carousel navigation arrows for 3 releases', async ({ page }) => {
      await page.goto('/artists/e2e-artist');

      await expect(page.getByText('E2E Artist')).toBeVisible({ timeout: 15_000 });

      // With 3 releases, navigation arrows should be visible (threshold changed to > 2)
      await expect(page.getByRole('button', { name: /previous/i })).toBeVisible();
      await expect(page.getByRole('button', { name: /next/i })).toBeVisible();
    });

    test('should select a different release when clicking its thumbnail', async ({ page }) => {
      await page.goto('/artists/e2e-artist');

      await expect(page.getByText('E2E Artist')).toBeVisible({ timeout: 15_000 });

      // Click the second release thumbnail
      await page.getByRole('button', { name: /play e2e album two/i }).click();

      // The selected release should update — verify by checking the track name changes
      await expect(page.getByText('E2E Track Beta')).toBeVisible({ timeout: 5_000 });
    });

    test('should mark the first release as selected by default', async ({ page }) => {
      await page.goto('/artists/e2e-artist');

      await expect(page.getByText('E2E Artist')).toBeVisible({ timeout: 15_000 });

      // First release thumbnail should be pressed (aria-pressed)
      const firstButton = page.getByRole('button', { name: /play e2e album one/i });
      await expect(firstButton).toHaveAttribute('aria-pressed', 'true');

      // Second release should not be pressed
      const secondButton = page.getByRole('button', { name: /play e2e album two/i });
      await expect(secondButton).toHaveAttribute('aria-pressed', 'false');
    });
  });
});
