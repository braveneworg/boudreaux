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
const createTestVenue = async (overrides?: Record<string, string>) => {
  return prisma.venue.create({
    data: {
      name: `E2E Venue ${Date.now()}`,
      city: 'New Orleans',
      state: 'LA',
      country: 'US',
      ...overrides,
    },
  });
};

test.describe('Admin Venue Edit', () => {
  test.describe.configure({ timeout: 150000 });
  let tourId: string;
  let venueId: string;
  let venueName: string;

  test.beforeEach(async ({ adminPage }) => {
    // Create a venue without address/postalCode to simulate the update use case
    const venue = await createTestVenue();
    venueId = venue.id;
    venueName = venue.name;

    // Create a tour via UI
    const title = `E2E Venue Edit Tour ${Date.now()}`;
    tourId = await createTourViaUi(adminPage, title);

    // Navigate to the tour edit page
    await adminPage.goto(`/admin/tours/${tourId}`);
    await expect(adminPage.getByText('Tour Dates').first()).toBeVisible();
  });

  test.afterEach(async () => {
    await prisma.tourDate.deleteMany({ where: { tourId } });
    await prisma.tour.deleteMany({
      where: { title: { startsWith: 'E2E Venue Edit Tour' } },
    });
    if (venueId) {
      await prisma.venue.deleteMany({ where: { id: venueId } });
    }
  });

  test('should show edit pencil button when venue is selected in tour date form', async ({
    adminPage,
  }) => {
    // Open add tour date dialog
    const addButton = adminPage.getByRole('button', { name: /Add.*Date/i }).first();
    await addButton.click();

    const dialog = adminPage.getByRole('dialog', { name: 'Add Tour Date' });
    await expect(dialog).toBeVisible();

    // Select venue
    const venueButton = dialog.getByRole('combobox').nth(1);
    await venueButton.click();
    await adminPage.getByPlaceholder('Search venues...').fill(venueName);
    await adminPage
      .getByRole('option', { name: new RegExp(venueName) })
      .first()
      .click();

    // Pencil button should now be visible next to the venue dropdown
    const editButton = dialog.getByRole('button', { name: 'Edit venue' });
    await expect(editButton).toBeVisible();
  });

  test('should open edit dialog and populate venue fields', async ({ adminPage }) => {
    // Open add tour date dialog
    const addButton = adminPage.getByRole('button', { name: /Add.*Date/i }).first();
    await addButton.click();

    const dialog = adminPage.getByRole('dialog', { name: 'Add Tour Date' });
    await expect(dialog).toBeVisible();

    // Select venue
    const venueButton = dialog.getByRole('combobox').nth(1);
    await venueButton.click();
    await adminPage.getByPlaceholder('Search venues...').fill(venueName);
    await adminPage
      .getByRole('option', { name: new RegExp(venueName) })
      .first()
      .click();

    // Click the edit pencil button
    const editButton = dialog.getByRole('button', { name: 'Edit venue' });
    await editButton.click();

    // Edit venue dialog should appear
    const editDialog = adminPage.getByRole('dialog', { name: 'Edit Venue' });
    await expect(editDialog).toBeVisible();

    // Fields should be populated with the venue's existing data
    await expect(editDialog.locator('#edit-venue-name')).toHaveValue(venueName);
    await expect(editDialog.locator('#edit-venue-city')).toHaveValue('New Orleans');
    await expect(editDialog.locator('#edit-venue-state')).toHaveValue('LA');
    await expect(editDialog.locator('#edit-venue-country')).toHaveValue('US');

    // Address and postal code should be empty since we didn't seed them
    await expect(editDialog.locator('#edit-venue-address')).toHaveValue('');
    await expect(editDialog.locator('#edit-venue-postal-code')).toHaveValue('');
  });

  test('should update venue address and postal code', async ({ adminPage }) => {
    // Open add tour date dialog
    const addButton = adminPage.getByRole('button', { name: /Add.*Date/i }).first();
    await addButton.click();

    const dialog = adminPage.getByRole('dialog', { name: 'Add Tour Date' });
    await expect(dialog).toBeVisible();

    // Select venue
    const venueButton = dialog.getByRole('combobox').nth(1);
    await venueButton.click();
    await adminPage.getByPlaceholder('Search venues...').fill(venueName);
    await adminPage
      .getByRole('option', { name: new RegExp(venueName) })
      .first()
      .click();

    // Click the edit pencil button
    const editButton = dialog.getByRole('button', { name: 'Edit venue' });
    await editButton.click();

    // Edit venue dialog should appear
    const editDialog = adminPage.getByRole('dialog', { name: 'Edit Venue' });
    await expect(editDialog).toBeVisible();

    // Wait for fields to be loaded (not showing skeleton)
    await expect(editDialog.locator('#edit-venue-name')).toBeVisible();

    // Fill in missing address fields
    await editDialog.locator('#edit-venue-address').fill('123 Bourbon Street');
    await editDialog.locator('#edit-venue-postal-code').fill('70116');

    // Click Update Venue button
    await editDialog.getByRole('button', { name: 'Update Venue' }).click();

    // Edit dialog should close
    await expect(editDialog).not.toBeVisible({ timeout: 10000 });

    // Verify the venue was updated in the database
    const updatedVenue = await prisma.venue.findUnique({ where: { id: venueId } });
    expect(updatedVenue?.address).toBe('123 Bourbon Street');
    expect(updatedVenue?.postalCode).toBe('70116');
    // Original fields should be preserved
    expect(updatedVenue?.city).toBe('New Orleans');
    expect(updatedVenue?.state).toBe('LA');
    expect(updatedVenue?.country).toBe('US');
  });

  test('should dismiss edit dialog on cancel', async ({ adminPage }) => {
    // Open add tour date dialog
    const addButton = adminPage.getByRole('button', { name: /Add.*Date/i }).first();
    await addButton.click();

    const dialog = adminPage.getByRole('dialog', { name: 'Add Tour Date' });
    await expect(dialog).toBeVisible();

    // Select venue
    const venueButton = dialog.getByRole('combobox').nth(1);
    await venueButton.click();
    await adminPage.getByPlaceholder('Search venues...').fill(venueName);
    await adminPage
      .getByRole('option', { name: new RegExp(venueName) })
      .first()
      .click();

    // Click the edit pencil button
    const editButton = dialog.getByRole('button', { name: 'Edit venue' });
    await editButton.click();

    // Edit venue dialog should appear
    const editDialog = adminPage.getByRole('dialog', { name: 'Edit Venue' });
    await expect(editDialog).toBeVisible();

    // Wait for fields to load
    await expect(editDialog.locator('#edit-venue-name')).toBeVisible();

    // Make a change but cancel
    await editDialog.locator('#edit-venue-address').fill('Should Not Save');
    await editDialog.getByRole('button', { name: 'Cancel' }).click();

    // Edit dialog should close
    await expect(editDialog).not.toBeVisible();

    // Verify the venue was NOT updated in the database
    const venue = await prisma.venue.findUnique({ where: { id: venueId } });
    expect(venue?.address).toBeNull();
  });
});
