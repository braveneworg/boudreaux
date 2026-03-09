/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { prisma } from '@/lib/prisma';

import { test, expect } from '../fixtures/base.fixture';

import type { Page } from '@playwright/test';

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

  // Wait for the dialog to appear
  const dialog = adminPage.locator('[role="dialog"]');
  await expect(dialog).toBeVisible();

  // Select venue
  const venueButton = dialog.getByRole('combobox').first();
  await venueButton.click();
  await adminPage.getByPlaceholder('Search venues...').fill(venueName);
  await adminPage
    .getByRole('option', { name: new RegExp(venueName) })
    .first()
    .click();

  // Select headlining artists (use the seeded test artists)
  const headlinerButton = dialog.locator('button[role="combobox"]').nth(1);
  await headlinerButton.click();
  await adminPage.getByRole('option', { name: 'Test Artist One' }).click();
  await adminPage.getByRole('option', { name: 'Test Artist Two' }).click();
  // Close the popover by pressing Escape
  await adminPage.keyboard.press('Escape');

  // Set start date: click the date picker and select today
  const startDateButton = dialog
    .locator('button')
    .filter({ hasText: /pick a date/i })
    .first();
  await startDateButton.click();
  // Click today's date in the calendar
  await adminPage.locator('[data-today="true"]').first().click();

  // Submit the form
  await dialog.getByRole('button', { name: /Add Tour Date/i }).click();

  // Wait for the dialog to close and a toast to appear
  await expect(dialog).not.toBeVisible({ timeout: 10000 });
};

test.describe('Admin Tour Date Artist Pills', () => {
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
    await expect(adminPage.getByText('Tour Dates')).toBeVisible();

    // Add a tour date with artists
    await addTourDateViaUi(adminPage, venueName);

    // Wait for the page to refresh and show headliner pills
    await expect(adminPage.getByText('Tour Dates')).toBeVisible();
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

    // The set time should appear below the pill
    await expect(adminPage.getByText('8:30 PM')).toBeVisible();
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
    await expect(pillList.getByText('Test Artist Two')).not.toBeVisible();

    // First artist should still be visible
    await expect(pillList.getByText('Test Artist One')).toBeVisible();
  });
});
