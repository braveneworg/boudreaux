/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { PrismaClient } from '@prisma/client';

import { test, expect } from '../fixtures/base.fixture';

import type { Page } from '@playwright/test';

const E2E_DATABASE_URL =
  process.env.E2E_DATABASE_URL || 'mongodb://localhost:27018/boudreaux-e2e?replicaSet=rs0';

const prisma = new PrismaClient({ datasourceUrl: E2E_DATABASE_URL });

/**
 * Helper to create a tour via the admin UI and return its ID.
 */
const createTourViaUi = async (adminPage: Page, title: string): Promise<string> => {
  await adminPage.goto('/admin/tours/new');
  await adminPage.fill('[name="title"]', title);
  await adminPage.getByRole('button', { name: 'Create Tour', exact: true }).click();
  await expect(adminPage).toHaveURL('/admin/tours');

  const tourLink = adminPage.getByRole('link', { name: title }).first();
  await expect(tourLink).toBeVisible();
  const href = await tourLink.getAttribute('href');
  expect(href).toBeTruthy();
  return href!.split('/').at(-1)!;
};

/**
 * Helper to create a venue directly in the DB for test use.
 */
const createTestVenue = async () => {
  return prisma.venue.create({
    data: {
      name: `E2E Venue ${Date.now()}`,
      city: 'New Orleans',
      state: 'LA',
      country: 'US',
    },
  });
};

/**
 * Helper to add a tour date to a tour via the UI.
 * Assumes the admin is on the tour edit page.
 */
const addTourDateViaUi = async (adminPage: Page, venueName: string) => {
  // Click "Add Tour Date" or "Add Date" button
  const addButton = adminPage.getByRole('button', { name: /Add.*Date/i }).first();
  await addButton.click();

  // Wait for the dialog to appear — scope to the named dialog to avoid matching
  // Radix PopoverContent elements which also render with role="dialog"
  const dialog = adminPage.getByRole('dialog', { name: 'Add Tour Date' });
  await expect(dialog).toBeVisible();

  // Select venue — venue combobox is now in the Dates and Times section,
  // after the Headliners section, so it is the second combobox (index 1).
  const venueButton = dialog.getByRole('combobox').nth(1);
  await venueButton.click();
  await adminPage.getByPlaceholder('Search venues...').fill(venueName);
  await adminPage
    .getByRole('option', { name: new RegExp(venueName) })
    .first()
    .click();

  // Select headlining artists — headliner combobox is first (index 0) since
  // the Artists section now appears before the Dates and Times section.
  const headlinerButton = dialog.locator('button[role="combobox"]').first();
  await headlinerButton.click();
  await adminPage.getByRole('option', { name: 'Test Artist One' }).click();
  await adminPage.getByRole('option', { name: 'Test Artist Two' }).click();
  // Close the popover with Escape — the PopoverContent's onEscapeKeyDown handler
  // calls stopPropagation() so the Dialog underneath won't close.
  await adminPage.keyboard.press('Escape');

  // Set start date: type today's date directly into the input
  // (the DatePicker uses PopoverAnchor, not PopoverTrigger, so clicking
  // the input does not open a calendar — we type the date instead).
  // Filling the date also auto-populates Show Start Time to 8 PM.
  const startDateInput = dialog.getByPlaceholder('mm/dd/yyyy').first();
  const today = new Date();
  const dateString = `${String(today.getMonth() + 1).padStart(2, '0')}/${String(today.getDate()).padStart(2, '0')}/${today.getFullYear()}`;
  await startDateInput.fill(dateString);

  // Submit the form
  await dialog.getByRole('button', { name: /Add Tour Date/i }).click();

  // Wait for the dialog to close (allow extra time for dev-mode compilation on first run)
  await expect(dialog).not.toBeVisible({ timeout: 60000 });

  // The tour date is created server-side but the page may not immediately reflect the change.
  // Reload to ensure the tour dates list is fresh.
  await adminPage.reload();
  await adminPage.waitForLoadState('networkidle');
};

test.describe('Admin Tour Date Artist Pills', () => {
  test.describe.configure({ timeout: 150000 });
  let tourId: string;
  let venueId: string;
  let venueName: string;

  test.beforeEach(async ({ adminPage }) => {
    // Create a venue for the test
    const venue = await createTestVenue();
    venueId = venue.id;
    venueName = venue.name;

    // Create a tour via UI
    const title = `E2E Artist Pills Tour ${Date.now()}`;
    tourId = await createTourViaUi(adminPage, title);

    // Navigate to the tour edit page
    await adminPage.goto(`/admin/tours/${tourId}`);

    // Wait for tour dates section to load
    await expect(adminPage.getByText('Tour Dates').first()).toBeVisible();

    // Add a tour date with artists
    await addTourDateViaUi(adminPage, venueName);

    // Wait for the page to refresh and show headliner pills
    await expect(adminPage.getByText('Tour Dates').first()).toBeVisible();
  });

  test.afterEach(async () => {
    // Cleanup: delete tour cascades to tour dates and headliners
    await prisma.tourDate.deleteMany({ where: { tourId } });
    await prisma.tour.deleteMany({
      where: { title: { startsWith: 'E2E Artist Pills Tour' } },
    });
    if (venueId) {
      await prisma.venue.deleteMany({ where: { id: venueId } });
    }
  });

  test('should display artist pills with order numbers', async ({ adminPage }) => {
    // The headliner pills should be visible with order numbers
    const pillList = adminPage.locator('[role="list"][aria-label="Headlining artists"]');
    await expect(pillList).toBeVisible({ timeout: 10000 });

    // Check that order numbers 1 and 2 are displayed
    await expect(pillList.getByText('1', { exact: true })).toBeVisible();
    await expect(pillList.getByText('2', { exact: true })).toBeVisible();

    // Check that artist names are displayed
    await expect(pillList.getByText('Test Artist One')).toBeVisible();
    await expect(pillList.getByText('Test Artist Two')).toBeVisible();
  });

  test('should open three-dot menu and show set time picker', async ({ adminPage }) => {
    const pillList = adminPage.locator('[role="list"][aria-label="Headlining artists"]');
    await expect(pillList).toBeVisible({ timeout: 10000 });

    // Click the three-dot menu on the first artist pill
    const optionsButton = adminPage.getByLabel(/Options for Test Artist One/i).first();
    await optionsButton.click();

    // The popover should show a time picker
    await expect(adminPage.getByText('Set Time (optional)')).toBeVisible();
    await expect(adminPage.getByText('Remove from tour date')).toBeVisible();
  });

  test('should set and display set time for an artist', async ({ adminPage }) => {
    const pillList = adminPage.locator('[role="list"][aria-label="Headlining artists"]');
    await expect(pillList).toBeVisible({ timeout: 10000 });

    // Open options menu for first artist
    await adminPage
      .getByLabel(/Options for Test Artist One/i)
      .first()
      .click();

    // Click the time picker button
    await adminPage.getByRole('button', { name: /select set time/i }).click();

    // Set a time (e.g., 8:30 PM)
    const hourInput = adminPage.locator('input[type="number"]').first();
    await hourInput.clear();
    await hourInput.fill('8');

    const minuteInput = adminPage.locator('input[type="number"]').nth(1);
    await minuteInput.clear();
    await minuteInput.fill('30');

    // Ensure PM is selected
    await adminPage.getByRole('button', { name: 'PM', exact: true }).click();

    // Apply the time
    await adminPage.getByRole('button', { name: 'Apply', exact: true }).click();

    // Check for success toast
    await expect(adminPage.getByText('Set time updated')).toBeVisible({ timeout: 5000 });

    // The set time should appear below the pill (scope to list to avoid matching
    // the TimePicker trigger button in the still-open options popover)
    await expect(pillList.getByText('8:30 PM')).toBeVisible();
  });

  test('should show confirmation dialog before removing an artist', async ({ adminPage }) => {
    const pillList = adminPage.locator('[role="list"][aria-label="Headlining artists"]');
    await expect(pillList).toBeVisible({ timeout: 10000 });

    // Open options menu for second artist
    await adminPage
      .getByLabel(/Options for Test Artist Two/i)
      .first()
      .click();

    // Click remove button
    await adminPage.getByRole('button', { name: /Remove from tour date/i }).click();

    // Confirmation dialog should appear
    await expect(adminPage.getByText('Remove Artist')).toBeVisible();
    await expect(
      adminPage.getByText(/Are you sure you want to remove.*Test Artist Two/i)
    ).toBeVisible();

    // Cancel the removal
    await adminPage.getByRole('button', { name: 'Cancel', exact: true }).click();

    // Artist should still be visible
    await expect(pillList.getByText('Test Artist Two')).toBeVisible();
  });

  test('should remove an artist from the tour date after confirmation', async ({ adminPage }) => {
    const pillList = adminPage.locator('[role="list"][aria-label="Headlining artists"]');
    await expect(pillList).toBeVisible({ timeout: 10000 });

    // Open options menu for second artist
    await adminPage
      .getByLabel(/Options for Test Artist Two/i)
      .first()
      .click();

    // Click remove button
    await adminPage.getByRole('button', { name: /Remove from tour date/i }).click();

    // Confirm the removal
    await adminPage.getByRole('button', { name: 'Remove', exact: true }).click();

    // Check for success toast
    await expect(adminPage.getByText('Artist removed from tour date')).toBeVisible({
      timeout: 5000,
    });

    // Artist should no longer be visible
    await expect(pillList.getByText('Test Artist Two')).not.toBeVisible({ timeout: 10000 });

    // First artist should still be visible
    await expect(pillList.getByText('Test Artist One')).toBeVisible();
  });
});
