/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { PrismaClient } from '@prisma/client';

import { test, expect } from '../fixtures/base.fixture';

const E2E_DATABASE_URL =
  process.env.E2E_DATABASE_URL || 'mongodb://localhost:27018/boudreaux-e2e?replicaSet=rs0';

const prisma = new PrismaClient({ datasourceUrl: E2E_DATABASE_URL });

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

test.describe('Admin Tour Date Artist Pills', () => {
  test.describe.configure({ timeout: 150000 });
  let tourId: string;
  let venueId: string;

  test.beforeEach(async ({ adminPage }) => {
    // Seed the fixture state (venue, tour, tour date, two headliners) directly
    // via the DB rather than driving the multi-step "Add Tour Date" dialog
    // through the UI. These tests only exercise the artist-pill UI (display,
    // set time, remove); the UI-driven setup made beforeEach flaky under
    // parallel load against the standalone server, where the mutation→reload
    // round-trip contends with other workers and intermittently times out.
    const venue = await createTestVenue();
    venueId = venue.id;

    const [artistOne, artistTwo] = await Promise.all([
      prisma.artist.findUniqueOrThrow({ where: { slug: 'test-artist-one' } }),
      prisma.artist.findUniqueOrThrow({ where: { slug: 'test-artist-two' } }),
    ]);

    const now = new Date();
    const tour = await prisma.tour.create({
      data: {
        title: `E2E Artist Pills Tour ${Date.now()}`,
        tourDates: {
          create: {
            startDate: now,
            showStartTime: now,
            venueId: venue.id,
            headliners: {
              create: [
                { artistId: artistOne.id, sortOrder: 0 },
                { artistId: artistTwo.id, sortOrder: 1 },
              ],
            },
          },
        },
      },
    });
    tourId = tour.id;

    // Navigate to the tour edit page and wait for the headliner pills to render.
    await adminPage.goto(`/admin/tours/${tourId}`);
    await expect(adminPage.getByText('Tour Dates').first()).toBeVisible();
    await expect(adminPage.locator('[role="list"][aria-label="Headlining artists"]')).toBeVisible({
      timeout: 15000,
    });
  });

  test.afterEach(async () => {
    // Scope cleanup to THIS test's tour by id. Deleting by title prefix would
    // also remove tours created by other artist-pills tests running in parallel
    // (fullyParallel + workers=50%), yanking their seeded tour date out from
    // under them mid-run and causing flaky "record not found" / empty-list
    // failures. Deleting the tour cascades to its tour dates and headliners.
    await prisma.tourDate.deleteMany({ where: { tourId } });
    await prisma.tour.deleteMany({ where: { id: tourId } });
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
