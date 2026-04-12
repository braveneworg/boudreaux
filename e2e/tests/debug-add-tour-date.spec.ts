import { PrismaClient } from '@prisma/client';

import { test, expect } from '../fixtures/base.fixture';

const E2E_DATABASE_URL =
  process.env.E2E_DATABASE_URL || 'mongodb://localhost:27018/boudreaux-e2e?replicaSet=rs0';

const prisma = new PrismaClient({ datasourceUrl: E2E_DATABASE_URL });

test('debug: add tour date step by step', async ({ adminPage }) => {
  test.setTimeout(120000);

  // Create venue
  const venue = await prisma.venue.create({
    data: { name: `Debug Venue ${Date.now()}`, city: 'New Orleans', state: 'LA', country: 'US' },
  });

  // Create tour
  await adminPage.goto('/admin/tours/new');
  await adminPage.fill('[name="title"]', 'Debug Tour');
  await adminPage.getByRole('button', { name: 'Create Tour', exact: true }).click();
  await expect(adminPage).toHaveURL('/admin/tours');

  const tourLink = adminPage.getByRole('link', { name: 'Debug Tour' }).first();
  await expect(tourLink).toBeVisible();
  const href = await tourLink.getAttribute('href');
  const tourId = href!.split('/').at(-1)!;

  // Navigate to tour edit page
  await adminPage.goto(`/admin/tours/${tourId}`);
  await expect(adminPage.getByText('Tour Dates').first()).toBeVisible();

  // Click Add Tour Date button
  const addButton = adminPage.getByRole('button', { name: /Add.*Date/i }).first();
  await addButton.click();

  const dialog = adminPage.getByRole('dialog', { name: 'Add Tour Date' });
  await expect(dialog).toBeVisible();
  console.log('STEP 1: Dialog visible');

  // Select venue
  const venueButton = dialog.getByRole('combobox').nth(1);
  await venueButton.click();
  await adminPage.getByPlaceholder('Search venues...').fill(venue.name);
  await adminPage
    .getByRole('option', { name: new RegExp(venue.name) })
    .first()
    .click();
  console.log('STEP 2: Venue selected');

  // Select headliner artists
  const headlinerButton = dialog.locator('button[role="combobox"]').first();
  await headlinerButton.click();
  await expect(adminPage.getByRole('option', { name: 'Test Artist One' })).toBeVisible({
    timeout: 10000,
  });
  await adminPage.getByRole('option', { name: 'Test Artist One' }).click();
  await adminPage.getByRole('option', { name: 'Test Artist Two' }).click();
  console.log('STEP 3: Artists selected');

  // Close headliner popover with Escape
  await adminPage.keyboard.press('Escape');
  await adminPage.waitForTimeout(500);

  // Verify the popover is closed (check that headliner button says "2 artists selected")
  const headlinerText = await headlinerButton.textContent();
  console.log(`STEP 4: Headliner button text after close: "${headlinerText}"`);

  // Check if popover is still open
  const popoverContent = adminPage.locator('[data-radix-popper-content-wrapper]');
  const popoverVisible = await popoverContent.isVisible().catch(() => false);
  console.log(`STEP 5: Popover still visible: ${popoverVisible}`);

  // Fill start date
  const startDateInput = dialog.getByPlaceholder('mm/dd/yyyy').first();
  const today = new Date();
  const dateString = `${String(today.getMonth() + 1).padStart(2, '0')}/${String(today.getDate()).padStart(2, '0')}/${today.getFullYear()}`;
  await startDateInput.fill(dateString);
  console.log(`STEP 6: Date filled: ${dateString}`);

  // Wait a moment for any auto-populate to happen
  await adminPage.waitForTimeout(500);

  // Take a pre-submit screenshot
  await adminPage.screenshot({ path: 'e2e/test-results/debug-before-submit-v2.png' });

  // Try to scroll down in dial to see submit button
  // Before submitting, let's try to scroll down in the dialog
  await dialog.evaluate((el) => el.scrollTo(0, el.scrollHeight));
  await adminPage.waitForTimeout(200);
  await adminPage.screenshot({ path: 'e2e/test-results/debug-scrolled-v2.png' });

  // Click submit
  const submitButton = dialog.getByRole('button', { name: /Add Tour Date/i });
  console.log(`STEP 7: Submit button found, clicking...`);
  await submitButton.click();

  // Wait a bit to see response
  await adminPage.waitForTimeout(2000);
  const dialogVisible = await dialog.isVisible();
  console.log(`STEP 8: Dialog visible after submit: ${dialogVisible}`);

  if (dialogVisible) {
    // Check for validation errors in the dialog
    const allText = await dialog.textContent();
    // Find validation-related text
    const errorTexts = await dialog
      .locator('.text-destructive, [data-slot="form-message"]')
      .allTextContents();
    console.log(`STEP 9: Error messages: ${JSON.stringify(errorTexts)}`);
    await adminPage.screenshot({ path: 'e2e/test-results/debug-errors-v2.png' });
  } else {
    console.log('STEP 9: Dialog closed');
    // Check DB for tour dates
    const tourDates = await prisma.tourDate.findMany({ where: { tourId } });
    console.log(`STEP 10: Tour dates in DB: ${tourDates.length}`);
    for (const td of tourDates) {
      console.log(
        `  Tour date: venueId=${td.venueId}, startDate=${td.startDate}, showStartTime=${td.showStartTime}`
      );
    }

    // Check UI
    const noTourDates = await adminPage
      .getByText('No Tour Dates Yet')
      .isVisible()
      .catch(() => false);
    console.log(`STEP 11: "No Tour Dates Yet" visible: ${noTourDates}`);

    // Maybe the page needs to reload?
    await adminPage.reload();
    await adminPage.waitForTimeout(2000);
    const noTourDatesAfterReload = await adminPage
      .getByText('No Tour Dates Yet')
      .isVisible()
      .catch(() => false);
    console.log(`STEP 12: "No Tour Dates Yet" after reload: ${noTourDatesAfterReload}`);
  }

  // Cleanup
  await prisma.tourDate.deleteMany({ where: { tourId } });
  await prisma.tour.deleteMany({ where: { title: 'Debug Tour' } });
  await prisma.venue.deleteMany({ where: { id: venue.id } });
});
