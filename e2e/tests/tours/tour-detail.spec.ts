/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { expect, test } from '@playwright/test';
import { PrismaClient } from '@prisma/client';

/**
 * Public tour detail page (`/tours/[tourId]`). Only tour *search* is covered
 * elsewhere; this exercises the detail view, which renders title, venue,
 * headliner and tour-date information for a single seeded tour.
 *
 * Seed reference (e2e/helpers/seed-test-db.ts): "E2E Summer Tour 2026" plays
 * The Fillmore (San Francisco, CA) on 2026-07-15 with The Beatles headlining.
 */
const E2E_DATABASE_URL =
  process.env.E2E_DATABASE_URL || 'mongodb://localhost:27018/boudreaux-e2e?replicaSet=rs0';

const prisma = new PrismaClient({ datasourceUrl: E2E_DATABASE_URL });

let summerTourId: string;

test.beforeAll(async () => {
  const tour = await prisma.tour.findFirstOrThrow({
    where: { title: 'E2E Summer Tour 2026' },
    select: { id: true },
  });
  summerTourId = tour.id;
});

test.afterAll(async () => {
  await prisma.$disconnect();
});

test.describe('Public Tour Detail Page', () => {
  test('renders the tour title, venue, headliner and tour-dates section', async ({ page }) => {
    await page.goto(`/tours/${summerTourId}`);

    // .first() — the title appears in both the breadcrumb and the card title
    await expect(page.getByText('E2E Summer Tour 2026').first()).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText('Tour Dates')).toBeVisible();
    await expect(page.getByText('The Fillmore')).toBeVisible();
    await expect(page.getByText('San Francisco, CA')).toBeVisible();
    await expect(page.getByText('The Beatles')).toBeVisible();
    await expect(page.getByRole('link', { name: 'Back to Tours' })).toBeVisible();
  });

  test('"Back to Tours" returns to the tours listing', async ({ page }) => {
    await page.goto(`/tours/${summerTourId}`);

    const backLink = page.getByRole('link', { name: 'Back to Tours' });
    await expect(backLink).toBeVisible({ timeout: 10_000 });
    await backLink.click();

    await page.waitForURL((url) => url.pathname === '/tours', { timeout: 10_000 });
    await expect(page.getByLabel('Search tours by artist name')).toBeVisible();
  });

  test('navigates from the tours listing into the detail page', async ({ page }) => {
    await page.goto('/tours');

    // Each tour card exposes a "View Details" link to its detail page.
    const summerCard = page
      .locator('[data-testid="tour-card"]')
      .filter({ hasText: 'E2E Summer Tour 2026' });
    await expect(summerCard).toBeVisible({ timeout: 10_000 });
    await summerCard.getByRole('link', { name: 'View Details' }).click();

    await page.waitForURL((url) => /^\/tours\/[a-f0-9]{24}$/.test(url.pathname), {
      timeout: 10_000,
    });
    await expect(page.getByText('Tour Dates')).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText('The Fillmore')).toBeVisible();
  });
});
