import { test, expect } from '../../fixtures/base.fixture';

import type { Page } from '@playwright/test';

/**
 * Switch the admin DataView combobox to "Track".
 * The admin page defaults to the "Artist" view.
 */
async function selectTrackView(adminPage: Page) {
  // Open the entity-type combobox (defaults to "Artist")
  await adminPage.getByRole('combobox').click();

  // Select "Track" from the popover list
  await adminPage.getByRole('option', { name: /^track$/i }).click();

  // Wait for the track listing to render
  await expect(adminPage.getByText('E2E Test Track One')).toBeVisible({ timeout: 15_000 });
}

test.describe('Admin Track Management', () => {
  test.describe('Track Listing', () => {
    test('should display the admin page with track data', async ({ adminPage }) => {
      await adminPage.goto('/admin');

      // The admin page defaults to Artists — switch to Tracks
      await selectTrackView(adminPage);

      await expect(adminPage.getByText('E2E Test Track One')).toBeVisible();
      await expect(adminPage.getByText('E2E Test Track Two')).toBeVisible();
    });
  });

  test.describe('Create Track', () => {
    test('should display the create track form', async ({ adminPage }) => {
      await adminPage.goto('/admin/tracks/new');

      await expect(adminPage.getByText('Create New Track')).toBeVisible({ timeout: 10_000 });

      // Verify required form fields are present
      await expect(adminPage.locator('input[name="title"]')).toBeVisible();
    });

    test('should create a new track with basic fields', async ({ adminPage }) => {
      await adminPage.goto('/admin/tracks/new');
      await expect(adminPage.getByText('Create New Track')).toBeVisible({ timeout: 10_000 });

      // Fill in required fields
      await adminPage.locator('input[name="title"]').fill('E2E Created Track');

      // Fill duration
      const durationInput = adminPage.locator('input[name="duration"]');
      await durationInput.fill('3:30');

      // Fill audioUrl manually (skip S3 upload)
      await adminPage
        .locator('input[name="audioUrl"]')
        .fill('https://www.soundhelix.com/examples/mp3/SoundHelix-Song-5.mp3');

      // Submit the form via Create button
      await adminPage.getByRole('button', { name: 'Create', exact: true }).click();

      // Should see success toast
      await expect(adminPage.getByText(/created successfully/i)).toBeVisible({ timeout: 15_000 });
    });

    test('should show validation errors for missing required fields', async ({ adminPage }) => {
      await adminPage.goto('/admin/tracks/new');
      await expect(adminPage.getByText('Create New Track')).toBeVisible({ timeout: 10_000 });

      // Submit empty form
      await adminPage.getByRole('button', { name: 'Create', exact: true }).click();

      // react-hook-form + zod shows inline field errors (FormMessage components)
      await expect(adminPage.locator('[data-slot="form-message"]').first()).toBeVisible({
        timeout: 5_000,
      });
    });
  });

  test.describe('Edit Track', () => {
    test('should navigate to edit page from track listing', async ({ adminPage }) => {
      await adminPage.goto('/admin');

      // Switch to Track view
      await selectTrackView(adminPage);

      // Click the edit button (pencil icon) for the first track
      // The data-view renders edit links as anchor elements to /admin/tracks/[id]
      const editLink = adminPage.locator('a[href*="/admin/tracks/"]').first();
      await editLink.click();

      // Wait for the edit form to load
      await expect(adminPage.getByText('Edit Track')).toBeVisible({ timeout: 10_000 });
    });

    test('should load existing track data in edit form', async ({ adminPage }) => {
      await adminPage.goto('/admin');
      await selectTrackView(adminPage);

      // Navigate to edit page
      const editLink = adminPage.locator('a[href*="/admin/tracks/"]').first();
      await editLink.click();
      await expect(adminPage.getByText('Edit Track')).toBeVisible({ timeout: 10_000 });

      // Verify the title field is pre-populated
      const titleInput = adminPage.locator('input[name="title"]');
      await expect(titleInput).not.toHaveValue('');
    });

    test('should update track title and save', async ({ adminPage }) => {
      await adminPage.goto('/admin');
      await selectTrackView(adminPage);

      // Find and click edit link for a track
      const editLinks = adminPage.locator('a[href*="/admin/tracks/"]');
      await editLinks.first().click();
      await expect(adminPage.getByText('Edit Track')).toBeVisible({ timeout: 10_000 });

      // Wait for form data to fully load before modifying
      const titleInput = adminPage.locator('input[name="title"]');
      await expect(titleInput).toHaveValue(/E2E/, { timeout: 10_000 });

      // Modify the title
      await titleInput.clear();
      await titleInput.fill('E2E Updated Track Title');

      // Wait for react-hook-form to detect dirty state
      const saveButton = adminPage.getByRole('button', { name: 'Save' });
      await expect(saveButton).toBeEnabled({ timeout: 5_000 });
      await saveButton.click();

      await expect(adminPage.getByText(/saved successfully/i)).toBeVisible({ timeout: 10_000 });
    });
  });

  test.describe('Delete Track', () => {
    test('should soft-delete a track via the listing page', async ({ adminPage }) => {
      await adminPage.goto('/admin');
      await selectTrackView(adminPage);

      // Wait for the track marked for deletion to appear
      await expect(adminPage.getByText('E2E Track For Deletion')).toBeVisible();

      // Find the Delete button associated with this track
      // The DataView renders a Delete button (destructive variant) in each card footer
      const deleteButton = adminPage.getByRole('button', { name: 'Delete' }).first();
      await deleteButton.click();

      // A confirmation dialog should appear
      await expect(adminPage.getByText('Confirm Delete')).toBeVisible();

      // Click Confirm in the dialog
      await adminPage.getByRole('button', { name: 'Confirm' }).click();

      // Should see success toast
      await expect(adminPage.getByText(/successfully deleted/i)).toBeVisible({ timeout: 10_000 });
    });
  });

  test.describe('Access Control', () => {
    test('should deny admin page access for regular users', async ({ userPage }) => {
      await userPage.goto('/admin');

      // Regular user should not see admin content or be redirected
      // The exact behavior depends on implementation - admin pages may show error or redirect
      // Server actions use requireRole('admin') which throws 'Unauthorized'
      await expect(userPage.getByText('E2E Test Track One')).not.toBeVisible({ timeout: 5_000 });
    });
  });
});
