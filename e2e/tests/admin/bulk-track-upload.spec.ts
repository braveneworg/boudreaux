import { test, expect } from '../../fixtures/base.fixture';

test.describe('Admin Bulk Track Upload', () => {
  test.describe('Page Layout', () => {
    test('should display the bulk track upload form', async ({ adminPage }) => {
      await adminPage.goto('/admin/tracks/bulk');

      // The page should render the bulk upload interface
      await expect(adminPage.getByText(/drag and drop audio files/i)).toBeVisible({
        timeout: 15_000,
      });
    });

    test('should display the file input for selecting audio files', async ({ adminPage }) => {
      await adminPage.goto('/admin/tracks/bulk');

      await expect(adminPage.getByText(/drag and drop audio files/i)).toBeVisible({
        timeout: 15_000,
      });

      // The hidden file input should exist
      const fileInput = adminPage.locator('input[type="file"]');
      await expect(fileInput).toBeAttached();
    });
  });

  test.describe('Upload Options', () => {
    test('should show publish toggle switch', async ({ adminPage }) => {
      await adminPage.goto('/admin/tracks/bulk');

      await expect(adminPage.getByText(/drag and drop audio files/i)).toBeVisible({
        timeout: 15_000,
      });

      // The publish toggle should be visible by default with "Published" label
      await expect(adminPage.getByLabel(/published/i)).toBeVisible();
    });

    test('should show auto-create release checkbox', async ({ adminPage }) => {
      await adminPage.goto('/admin/tracks/bulk');

      await expect(adminPage.getByText(/drag and drop audio files/i)).toBeVisible({
        timeout: 15_000,
      });

      // Auto-create release checkbox should be visible
      await expect(adminPage.getByLabel(/automatically create or match releases/i)).toBeVisible();
    });

    test('should have publish toggle checked by default', async ({ adminPage }) => {
      await adminPage.goto('/admin/tracks/bulk');

      await expect(adminPage.getByText(/drag and drop audio files/i)).toBeVisible({
        timeout: 15_000,
      });

      const publishSwitch = adminPage.getByLabel(/published/i);
      await expect(publishSwitch).toBeChecked();
    });

    test('should toggle publish switch off and on', async ({ adminPage }) => {
      await adminPage.goto('/admin/tracks/bulk');

      await expect(adminPage.getByText(/drag and drop audio files/i)).toBeVisible({
        timeout: 15_000,
      });

      const publishSwitch = adminPage.getByLabel(/published/i);

      // Toggle off
      await publishSwitch.click();
      await expect(publishSwitch).not.toBeChecked();

      // Toggle back on
      await publishSwitch.click();
      await expect(publishSwitch).toBeChecked();
    });
  });

  test.describe('Access Control', () => {
    test('should deny bulk upload page access for regular users', async ({ userPage }) => {
      await userPage.goto('/admin/tracks/bulk');

      // Regular user should not see the upload interface
      await expect(userPage.getByText(/drag and drop audio files/i)).not.toBeVisible({
        timeout: 5_000,
      });
    });
  });
});
