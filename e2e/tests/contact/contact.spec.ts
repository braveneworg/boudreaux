import { test, expect } from '@playwright/test';

import { mockTurnstile } from '../../helpers/turnstile-mock';

test.describe('Contact Page', () => {
  test.beforeEach(async ({ page }) => {
    await mockTurnstile(page);
    await page.goto('/contact');
    // Wait for the form to load - the combobox is the first interactive field
    await page.getByRole('combobox').waitFor({ state: 'visible', timeout: 10_000 });
  });

  test.describe('static content', () => {
    test('should display the page heading', async ({ page }) => {
      await expect(page.getByRole('heading', { name: 'Contact Us' })).toBeVisible();
    });

    test('should display the breadcrumb', async ({ page }) => {
      await expect(page.getByRole('link', { name: 'Contact' })).toBeVisible();
    });

    test('should display the intro paragraph', async ({ page }) => {
      await expect(page.getByText(/have a question, demo, or business inquiry/i)).toBeVisible();
    });

    test('should display co-founders info', async ({ page }) => {
      await expect(page.getByText(/co-founders\/owners/i)).toBeVisible();
      await expect(page.getByText(/ceschi ramos and david ramos/i)).toBeVisible();
    });

    test('should display label manager info', async ({ page }) => {
      await expect(page.getByText(/label manager/i)).toBeVisible();
      await expect(page.getByText('dylanowenmusic@gmail.com')).toBeVisible();
    });

    test('should display distribution info', async ({ page }) => {
      await expect(page.getByText(/distribution/i).first()).toBeVisible();
      await expect(page.getByText(/jeep ward at redeye worldwide/i)).toBeVisible();
      await expect(page.getByText('jeephalo@gmail.com')).toBeVisible();
    });

    test('should display media and fan support info', async ({ page }) => {
      await expect(page.getByText(/media and fan support/i)).toBeVisible();
      await expect(page.getByText('nikianarchy@gmail.com')).toBeVisible();
    });

    test('should display customer service info', async ({ page }) => {
      await expect(page.getByText(/customer service/i)).toBeVisible();
      await expect(page.getByText('djmoniklz@gmail.com')).toBeVisible();
    });
  });

  test.describe('form fields', () => {
    test('should display the reason combobox', async ({ page }) => {
      await expect(page.getByRole('combobox')).toBeVisible();
      await expect(page.getByText('Select a reason...')).toBeVisible();
    });

    test('should display first name and last name fields', async ({ page }) => {
      await expect(page.locator('input[name="firstName"]')).toBeVisible();
      await expect(page.locator('input[name="lastName"]')).toBeVisible();
    });

    test('should display email field', async ({ page }) => {
      await expect(page.locator('input[name="email"]')).toBeVisible();
    });

    test('should display phone field', async ({ page }) => {
      await expect(page.locator('input[name="phone"]')).toBeVisible();
    });

    test('should display message textarea', async ({ page }) => {
      await expect(page.getByPlaceholder('How can we help?')).toBeVisible();
    });

    test('should display the submit button', async ({ page }) => {
      await expect(page.getByRole('button', { name: /send message/i })).toBeVisible();
    });
  });

  test.describe('reason combobox interaction', () => {
    test('should open combobox and show reason options', async ({ page }) => {
      await page.getByRole('combobox').click();
      // Wait for popover content to be visible after click
      await page.locator('role=option').first().waitFor({ state: 'visible', timeout: 5_000 });

      await expect(page.getByRole('option', { name: 'Question' })).toBeVisible();
      await expect(page.getByRole('option', { name: 'New opportunity' })).toBeVisible();
      await expect(page.getByRole('option', { name: 'Demo submission' })).toBeVisible();
      await expect(page.getByRole('option', { name: 'Other' })).toBeVisible();
    });

    test('should select a reason from the combobox', async ({ page }) => {
      const comboboxButton = page.getByRole('combobox', { name: 'Reason' });
      await comboboxButton.click();
      // Click on the Question option
      await page.locator('role=option').filter({ hasText: 'Question' }).click();

      // The combobox button should now display the selected reason
      await expect(comboboxButton).toContainText('Question');
    });
  });

  test.describe('form validation', () => {
    test('should show validation errors when submitting empty form', async ({ page }) => {
      await page.getByRole('button', { name: /send message/i }).click();
      // Validation error messages should appear
      await expect(page.locator('[data-slot="form-message"]').first()).toBeVisible({
        timeout: 5_000,
      });
    });

    test('should show reason validation error', async ({ page }) => {
      // Fill everything except reason
      await page.locator('input[name="firstName"]').fill('Jane');
      await page.locator('input[name="lastName"]').fill('Doe');
      await page.locator('input[name="email"]').fill('jane@example.com');
      await page
        .getByPlaceholder('How can we help?')
        .fill('I have a question about your label releases.');

      await page.getByRole('button', { name: /send message/i }).click();

      await expect(page.getByText('Please select a reason for contacting us')).toBeVisible({
        timeout: 5_000,
      });
    });

    test('should show email validation error for invalid email', async ({ page }) => {
      await page.getByRole('combobox').click();
      await page.locator('role=option').filter({ hasText: 'Question' }).click();

      await page.locator('input[name="firstName"]').fill('Jane');
      await page.locator('input[name="lastName"]').fill('Doe');
      await page.locator('input[name="email"]').fill('not-an-email');
      await page
        .getByPlaceholder('How can we help?')
        .fill('I have a question about your label releases.');

      await page.getByRole('button', { name: /send message/i }).click();

      await expect(page.getByText('Invalid email address')).toBeVisible({
        timeout: 5_000,
      });
    });

    test('should show message length validation error', async ({ page }) => {
      await page.getByRole('combobox').click();
      await page.locator('role=option').filter({ hasText: 'Question' }).click();

      await page.locator('input[name="firstName"]').fill('Jane');
      await page.locator('input[name="lastName"]').fill('Doe');
      await page.locator('input[name="email"]').fill('jane@example.com');
      await page.getByPlaceholder('How can we help?').fill('Short');

      await page.getByRole('button', { name: /send message/i }).click();

      await expect(
        page.getByText('Please provide more detail (at least 10 characters)')
      ).toBeVisible({
        timeout: 5_000,
      });
    });
  });

  test.describe('form interaction', () => {
    test('should allow filling all form fields', async ({ page }) => {
      // Select reason
      const comboboxButton = page.getByRole('combobox', { name: 'Reason' });
      await comboboxButton.click();
      await page.locator('role=option').filter({ hasText: 'Question' }).click();

      // Fill text fields
      await page.locator('input[name="firstName"]').fill('Jane');
      await page.locator('input[name="lastName"]').fill('Doe');
      await page.locator('input[name="email"]').fill('jane@example.com');
      await page.locator('input[name="phone"]').fill('+1 555-123-4567');
      await page
        .getByPlaceholder('How can we help?')
        .fill('I have a question about your label releases.');

      // Verify fields are populated
      await expect(comboboxButton).toContainText('Question');
      await expect(page.locator('input[name="firstName"]')).toHaveValue('Jane');
      await expect(page.locator('input[name="lastName"]')).toHaveValue('Doe');
      await expect(page.locator('input[name="email"]')).toHaveValue('jane@example.com');
      await expect(page.locator('input[name="phone"]')).toHaveValue('+1 555-123-4567');
      await expect(page.getByPlaceholder('How can we help?')).toHaveValue(
        'I have a question about your label releases.'
      );
    });

    test('should have all text fields enabled', async ({ page }) => {
      await expect(page.locator('input[name="firstName"]')).toBeEnabled();
      await expect(page.locator('input[name="lastName"]')).toBeEnabled();
      await expect(page.locator('input[name="email"]')).toBeEnabled();
      await expect(page.locator('input[name="phone"]')).toBeEnabled();
      await expect(page.getByPlaceholder('How can we help?')).toBeEnabled();
    });
  });
});
