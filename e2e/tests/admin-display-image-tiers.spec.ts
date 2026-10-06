/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { randomUUID } from 'node:crypto';

import { PrismaClient } from '@prisma/client';

import { expect, test } from '../fixtures/auth.fixture';

import type { Page } from '@playwright/test';

/**
 * Which images the public artist page shows, and how the admin's image
 * manager marks them (ADR-0008, #789). With images chosen, the page shows
 * those, and no tile is marked "Shown". With none chosen, it shows the job's
 * suggestions that have alt text ("Shown (suggested)"), else the first pool
 * images that have alt text ("Shown (first in pool)"). An image without alt
 * text is never shown. This was a manual smoke after #789.
 *
 * Each tier has its own artist, stamped per worker and removed by id.
 */

const E2E_DATABASE_URL =
  process.env.E2E_DATABASE_URL || 'mongodb://localhost:27018/boudreaux-e2e?replicaSet=rs0';

const prisma = new PrismaClient({ datasourceUrl: E2E_DATABASE_URL });

const STAMP = randomUUID().slice(0, 8);
const PAST = new Date('2000-01-01T00:00:00.000Z');
const made: string[] = [];

interface ImageSeed {
  title: string;
  alt: string;
  sortOrder: number;
  isPrimary?: boolean;
  displayOrder?: number;
}

/** A published artist and its image pool; returns the artist's id and slug. */
const seedArtist = async (
  tier: string,
  images: ImageSeed[]
): Promise<{ id: string; slug: string }> => {
  const slug = `e2e-tiers-${tier}-${STAMP}`;
  const { id } = await prisma.artist.create({
    data: { firstName: 'ZZ', surname: `E2E Tiers ${tier} ${STAMP}`, slug, publishedOn: PAST },
    select: { id: true },
  });
  made.push(id);
  await prisma.artistBioImage.createMany({
    data: images.map(({ title, ...rest }) => ({
      artistId: id,
      url: `https://example.com/e2e-tiers-${tier}-${title.toLowerCase()}-${STAMP}.jpg`,
      title: `${title} ${STAMP}`,
      ...rest,
    })),
  });
  return { id, slug };
};

/** The pool tile for an image, found by its preview button. */
const tileOf = (page: Page, title: string) =>
  page
    .getByRole('group', { name: 'Image pool' })
    .getByRole('listitem')
    .filter({
      has: page.getByRole('button', { name: `Preview ${title} ${STAMP}`, exact: true }),
    });

/** The images the public artist page shows, by their alt text. */
const shownOnPage = async (page: Page, slug: string): Promise<string[]> => {
  await page.goto(`/artists/${slug}`);
  const buttons = page
    .locator('[data-slot="artist-display-images"]')
    .getByRole('button', { name: /^Expand image: / });
  await expect(buttons.first()).toBeVisible({ timeout: 15_000 });
  return buttons.evaluateAll((items) =>
    items.map((item) => (item.getAttribute('aria-label') ?? '').replace(/^Expand image: /, ''))
  );
};

test.afterAll(async () => {
  await prisma.artistBioImage.deleteMany({ where: { artistId: { in: made } } });
  await prisma.artist.deleteMany({ where: { id: { in: made } } });
  await prisma.$disconnect();
});

test.describe('Display image tiers', () => {
  test('with nothing chosen, the suggestions with alt text are shown', async ({ adminPage }) => {
    const { id, slug } = await seedArtist('suggested', [
      { title: 'Suggestion', alt: 'Suggestion described', sortOrder: 0, isPrimary: true },
      { title: 'Pooled', alt: 'Pooled described', sortOrder: 1 },
      { title: 'Altless', alt: '', sortOrder: 2 },
    ]);

    await adminPage.goto(`/admin/artists/${id}`);
    await expect(tileOf(adminPage, 'Suggestion').getByText('Shown (suggested)')).toBeVisible({
      timeout: 15_000,
    });
    await expect(tileOf(adminPage, 'Pooled').getByText(/^Shown/)).toHaveCount(0);
    await expect(tileOf(adminPage, 'Altless').getByText(/^Shown/)).toHaveCount(0);

    expect(await shownOnPage(adminPage, slug)).toEqual(['Suggestion described']);
  });

  test('with no suggestion, the first pool image with alt text is shown', async ({ adminPage }) => {
    const { id, slug } = await seedArtist('pool', [
      { title: 'Altless', alt: '', sortOrder: 0 },
      { title: 'First', alt: 'First described', sortOrder: 1 },
    ]);

    await adminPage.goto(`/admin/artists/${id}`);
    await expect(tileOf(adminPage, 'First').getByText('Shown (first in pool)')).toBeVisible({
      timeout: 15_000,
    });
    await expect(tileOf(adminPage, 'Altless').getByText(/^Shown/)).toHaveCount(0);

    expect(await shownOnPage(adminPage, slug)).toEqual(['First described']);
  });

  test('with an image chosen, only it is shown and no tile is marked', async ({ adminPage }) => {
    const { id, slug } = await seedArtist('chosen', [
      { title: 'Suggestion', alt: 'Suggestion described', sortOrder: 0, isPrimary: true },
      { title: 'Chosen', alt: 'Chosen described', sortOrder: 1, displayOrder: 0 },
    ]);

    await adminPage.goto(`/admin/artists/${id}`);
    await expect(tileOf(adminPage, 'Chosen')).toHaveCount(1, { timeout: 15_000 });
    await expect(
      adminPage.getByRole('group', { name: 'Image pool' }).getByText(/^Shown/)
    ).toHaveCount(0);

    expect(await shownOnPage(adminPage, slug)).toEqual(['Chosen described']);
  });
});
