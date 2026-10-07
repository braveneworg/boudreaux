/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { randomUUID } from 'node:crypto';

import { PrismaClient } from '@prisma/client';

import { expect, test } from '../fixtures/auth.fixture';

/**
 * E2E coverage for the /admin/artists list and the rule that artists can only be
 * created from a release. The list still allows editing/deleting, but exposes no
 * create entry point, and the standalone create route redirects away.
 *
 * The badge test seeds two artists of its own, dated in the past so they file
 * after the seeded rows in the newest-first list, and removes them by id.
 */

const E2E_DATABASE_URL =
  process.env.E2E_DATABASE_URL || 'mongodb://localhost:27018/boudreaux-e2e?replicaSet=rs0';

const prisma = new PrismaClient({ datasourceUrl: E2E_DATABASE_URL });

const PAST = new Date('2000-01-01T00:00:00.000Z');
const made: string[] = [];

/** An unpublished artist; `withDisplayImage` gives it one chosen display image. */
const seedArtist = async (
  label: string,
  withDisplayImage: boolean
): Promise<{ id: string; displayName: string }> => {
  const stamp = randomUUID().slice(0, 8);
  const displayName = `ZZ E2E List ${label} ${stamp}`;
  const { id } = await prisma.artist.create({
    data: {
      firstName: 'ZZ',
      surname: `E2E List ${label} ${stamp}`,
      displayName,
      slug: `e2e-list-${label.toLowerCase()}-${stamp}`,
      createdAt: PAST,
      ...(withDisplayImage
        ? {
            bioImages: {
              create: {
                url: `https://example.com/e2e-list-${stamp}.jpg`,
                alt: displayName,
                origin: 'custom',
                displayOrder: 0,
              },
            },
          }
        : {}),
    },
    select: { id: true },
  });
  made.push(id);
  return { id, displayName };
};

test.afterAll(async () => {
  await prisma.artistBioImage.deleteMany({ where: { artistId: { in: made } } });
  await prisma.artist.deleteMany({ where: { id: { in: made } } });
  await prisma.$disconnect();
});

test.describe('Admin artists list', () => {
  // ADR-0019: the list flags an artist that cannot be published yet.
  test('badges an artist that has no display image', async ({ adminPage }) => {
    const bare = await seedArtist('Bare', false);
    const imaged = await seedArtist('Imaged', true);

    await adminPage.goto('/admin/artists');
    const cardOf = (displayName: string) =>
      adminPage.locator('li:not([data-sonner-toast])').filter({ hasText: displayName });

    await adminPage.getByPlaceholder(/search artists/i).fill(bare.displayName);
    await expect(cardOf(bare.displayName)).toBeVisible({ timeout: 15_000 });
    await expect(cardOf(bare.displayName).getByText('No display image')).toBeVisible();

    await adminPage.getByPlaceholder(/search artists/i).fill(imaged.displayName);
    await expect(cardOf(imaged.displayName)).toBeVisible({ timeout: 15_000 });
    await expect(cardOf(imaged.displayName).getByText('No display image')).toHaveCount(0);
  });

  test('renders the artists list with a search box', async ({ adminPage }) => {
    await adminPage.goto('/admin/artists');

    await expect(adminPage.getByRole('heading', { name: 'Artists', exact: true })).toBeVisible();
    await expect(adminPage.getByPlaceholder(/search artists/i)).toBeVisible();
  });

  test('does not expose a create-artist button', async ({ adminPage }) => {
    await adminPage.goto('/admin/artists');

    await expect(adminPage.getByRole('button', { name: /create artist/i })).toHaveCount(0);
  });

  test('redirects the standalone create route back to the list', async ({ adminPage }) => {
    await adminPage.goto('/admin/artists/new');

    await expect(adminPage).toHaveURL(/\/admin\/artists$/);
    await expect(adminPage.getByRole('heading', { name: 'Artists', exact: true })).toBeVisible();
  });

  test('still allows editing an existing artist', async ({ adminPage }) => {
    await adminPage.goto('/admin/artists');

    const editLink = adminPage.getByRole('link', { name: /edit/i }).first();
    await expect(editLink).toBeVisible({ timeout: 15_000 });
    await expect(editLink).toHaveAttribute('href', /\/admin\/artists\//);
  });
});
