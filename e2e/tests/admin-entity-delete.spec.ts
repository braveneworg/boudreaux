/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { PrismaClient } from '@prisma/client';

import { expect, test } from '../fixtures/auth.fixture';

/**
 * E2E coverage for the new admin delete flows wired to TanStack Query mutation
 * hooks → Server Actions:
 *  - Artist edit form "Delete Artist" → archiveArtistAction (soft delete).
 *  - Artist DataView list delete + restore → archiveArtistAction /
 *    restoreArtistAction (the raw-fetch-free DataView).
 *
 * Each test seeds and removes its own artist via Prisma against the isolated
 * E2E database, so it never mutates the shared seed data other specs assert on.
 */

const E2E_DATABASE_URL =
  process.env.E2E_DATABASE_URL || 'mongodb://localhost:27018/boudreaux-e2e?replicaSet=rs0';

const prisma = new PrismaClient({ datasourceUrl: E2E_DATABASE_URL });

/** Creates a published artist and returns its id + display name. */
const seedArtist = async (label: string) => {
  const stamp = Date.now();
  const displayName = `E2E Delete ${label} ${stamp}`;
  const slug = `e2e-delete-${label.toLowerCase()}-${stamp}`;
  const artist = await prisma.artist.create({
    data: { firstName: 'E2E', surname: label, slug, displayName, publishedOn: new Date() },
  });
  return { id: artist.id, displayName, slug };
};

test.describe('Admin entity delete flows', () => {
  const createdSlugs: string[] = [];

  test.afterAll(async () => {
    if (createdSlugs.length > 0) {
      await prisma.artist.deleteMany({ where: { slug: { in: createdSlugs } } });
    }
    await prisma.$disconnect();
  });

  test('artist edit form: Delete Artist archives and redirects to the list', async ({
    adminPage,
  }) => {
    const { id, displayName, slug } = await seedArtist('Form');
    createdSlugs.push(slug);

    await adminPage.goto(`/admin/artists/${id}`);

    // Open the confirmation AlertDialog, then confirm.
    await adminPage.getByRole('button', { name: 'Delete Artist', exact: true }).click();
    await adminPage.getByRole('button', { name: 'Delete', exact: true }).click();

    await expect(adminPage).toHaveURL('/admin/artists');

    // Soft-deleted artists are hidden from the default (non-deleted) list.
    await adminPage.getByPlaceholder(/search artists/i).fill(displayName);
    await expect(adminPage.getByText(displayName)).toHaveCount(0, { timeout: 15_000 });

    // Confirm the soft delete landed in the DB rather than a hard delete.
    const row = await prisma.artist.findUnique({ where: { id } });
    expect(row?.deletedOn).not.toBeNull();
  });

  test('artist list: delete then restore via the DataView', async ({ adminPage }) => {
    const { id, displayName, slug } = await seedArtist('List');
    createdSlugs.push(slug);

    await adminPage.goto('/admin/artists');

    // Find the seeded artist via search, then delete it from its own card
    // (the list can hold other artists, so scope to the matching <li>).
    await adminPage.getByPlaceholder(/search artists/i).fill(displayName);
    const card = adminPage.locator('li').filter({ hasText: displayName });
    await expect(card).toBeVisible({ timeout: 15_000 });

    await card.getByRole('button', { name: 'Delete', exact: true }).click();
    await adminPage.getByRole('button', { name: 'Confirm', exact: true }).click();

    await expect(adminPage.getByText(`Successfully deleted artist - ${displayName}`)).toBeVisible({
      timeout: 15_000,
    });

    // Reveal soft-deleted rows and restore it from its card.
    await adminPage.getByRole('switch', { name: /show deleted/i }).click();
    const deletedCard = adminPage.locator('li').filter({ hasText: displayName });
    await expect(deletedCard).toBeVisible({ timeout: 15_000 });

    await deletedCard.getByRole('button', { name: 'Restore', exact: true }).click();
    await adminPage.getByRole('button', { name: 'Confirm', exact: true }).click();

    await expect(adminPage.getByText(`Successfully restored artist - ${displayName}`)).toBeVisible({
      timeout: 15_000,
    });

    const row = await prisma.artist.findUnique({ where: { id } });
    expect(row?.deletedOn).toBeNull();
  });
});
