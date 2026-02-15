import { test, expect } from '../../fixtures/base.fixture';

test.describe('Profile Management', () => {
  test.describe('View Profile', () => {
    test('should display profile page with user data populated', async ({ userPage }) => {
      await userPage.goto('/profile');

      // Wait for profile form to load
      await expect(userPage.getByRole('heading', { name: 'Profile' })).toBeVisible({
        timeout: 10_000,
      });
      await expect(userPage.getByText('Personal Information')).toBeVisible();

      // Verify form fields are populated with seed data
      const firstNameInput = userPage.locator('input[name="firstName"]');
      await expect(firstNameInput).toHaveValue('Test');

      const lastNameInput = userPage.locator('input[name="lastName"]');
      await expect(lastNameInput).toHaveValue('User');
    });

    test('should display email and username sections', async ({ userPage }) => {
      await userPage.goto('/profile');
      await expect(userPage.getByRole('heading', { name: 'Profile' })).toBeVisible({
        timeout: 10_000,
      });

      // Use exact match to avoid matching "Manage your email address..." description
      await expect(userPage.getByText('Email Address', { exact: true })).toBeVisible();
      // "Username" text appears in multiple places (section title, field label, button),
      // so target the unique CardDescription instead
      await expect(userPage.getByText('Update your username')).toBeVisible();
    });
  });

  test.describe('Update Personal Information', () => {
    test('should update first name and show success toast', async ({ userPage }) => {
      await userPage.goto('/profile');
      await expect(userPage.getByRole('heading', { name: 'Profile' })).toBeVisible({
        timeout: 10_000,
      });

      const firstNameInput = userPage.locator('input[name="firstName"]');
      await expect(firstNameInput).toHaveValue('Test');

      // Clear and type new value
      await firstNameInput.clear();
      await firstNameInput.fill('Updated');

      // Save Changes button should be enabled now
      const saveButton = userPage.getByRole('button', { name: 'Save Changes' });
      await expect(saveButton).toBeEnabled();
      await saveButton.click();

      // Verify success toast
      await expect(userPage.getByText('Your profile has been updated successfully.')).toBeVisible({
        timeout: 10_000,
      });
    });

    test('should update phone number', async ({ userPage }) => {
      await userPage.goto('/profile');
      await expect(userPage.getByRole('heading', { name: 'Profile' })).toBeVisible({
        timeout: 10_000,
      });

      const phoneInput = userPage.locator('input[name="phone"]');
      await phoneInput.clear();
      await phoneInput.fill('+1 (555) 123-4567');

      const saveButton = userPage.getByRole('button', { name: 'Save Changes' });
      await expect(saveButton).toBeEnabled();
      await saveButton.click();

      await expect(userPage.getByText('Your profile has been updated successfully.')).toBeVisible({
        timeout: 10_000,
      });
    });

    test('should keep Save Changes disabled when form is pristine', async ({ userPage }) => {
      await userPage.goto('/profile');
      await expect(userPage.getByRole('heading', { name: 'Profile' })).toBeVisible({
        timeout: 10_000,
      });

      const saveButton = userPage.getByRole('button', { name: 'Save Changes' });
      await expect(saveButton).toBeDisabled();
    });

    test('should toggle SMS notifications switch', async ({ userPage }) => {
      await userPage.goto('/profile');
      await expect(userPage.getByRole('heading', { name: 'Profile' })).toBeVisible({
        timeout: 10_000,
      });

      const smsSwitch = userPage.locator('#allowSmsNotifications');
      await expect(smsSwitch).toBeVisible();

      // Click the switch to toggle
      await smsSwitch.click();

      // Form should be dirty; save button should be enabled
      const saveButton = userPage.getByRole('button', { name: 'Save Changes' });
      await expect(saveButton).toBeEnabled();
    });
  });

  test.describe('Change Email', () => {
    test('should show edit email form when clicking Edit Email', async ({ userPage }) => {
      await userPage.goto('/profile');
      await expect(userPage.getByRole('heading', { name: 'Profile' })).toBeVisible({
        timeout: 10_000,
      });

      const editEmailButton = userPage.getByRole('button', { name: 'Edit Email' });
      await expect(editEmailButton).toBeVisible();
      await editEmailButton.click();

      // Confirm Email field should now appear
      await expect(userPage.locator('input[name="confirmEmail"]')).toBeVisible();

      // Cancel button should appear (replacing Edit Email)
      await expect(userPage.getByRole('button', { name: 'Cancel' }).first()).toBeVisible();

      // Save Email button should appear
      await expect(userPage.getByRole('button', { name: 'Save Email' })).toBeVisible();
    });

    test('should cancel email editing and hide confirm field', async ({ userPage }) => {
      await userPage.goto('/profile');
      await expect(userPage.getByRole('heading', { name: 'Profile' })).toBeVisible({
        timeout: 10_000,
      });

      // Enter edit mode
      await userPage.getByRole('button', { name: 'Edit Email' }).click();
      await expect(userPage.locator('input[name="confirmEmail"]')).toBeVisible();

      // Click Cancel
      await userPage.getByRole('button', { name: 'Cancel' }).first().click();

      // Confirm Email field should be hidden again
      await expect(userPage.locator('input[name="confirmEmail"]')).not.toBeVisible();

      // Edit Email button should reappear
      await expect(userPage.getByRole('button', { name: 'Edit Email' })).toBeVisible();
    });
  });

  test.describe('Change Username', () => {
    test('should show edit username form when clicking Edit Username', async ({ userPage }) => {
      await userPage.goto('/profile');
      await expect(userPage.getByRole('heading', { name: 'Profile' })).toBeVisible({
        timeout: 10_000,
      });

      const editUsernameButton = userPage.getByRole('button', { name: 'Edit Username' });
      await expect(editUsernameButton).toBeVisible();
      await editUsernameButton.click();

      // Confirm Username field should appear
      await expect(userPage.locator('input[name="confirmUsername"]')).toBeVisible();

      // Save Username button should appear
      await expect(userPage.getByRole('button', { name: 'Save Username' })).toBeVisible();
    });

    test('should cancel username editing', async ({ userPage }) => {
      await userPage.goto('/profile');
      await expect(userPage.getByRole('heading', { name: 'Profile' })).toBeVisible({
        timeout: 10_000,
      });

      // Enter edit mode
      await userPage.getByRole('button', { name: 'Edit Username' }).click();
      await expect(userPage.locator('input[name="confirmUsername"]')).toBeVisible();

      // Click Cancel (the username section's Cancel button)
      // Use data-field attribute to target the correct cancel button
      await userPage.locator('button[data-field="username"]').click();

      // Confirm Username field should be hidden
      await expect(userPage.locator('input[name="confirmUsername"]')).not.toBeVisible();
    });
  });
});
