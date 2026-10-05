/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { PrismaClient } from '@prisma/client';

import { expect, test } from '../fixtures/auth.fixture';

/**
 * E2E coverage for ADR-0015: a release publishes its credited artists only by
 * confirmation, and hiding an artist warns about the public work that loses
 * the name.
 *
 * Each test seeds its own release and artists via Prisma against the isolated
 * E2E database, so it never mutates the shared seed data other specs assert
 * on.
 *
 * Parallel safety: the tests of this file can run in different workers, and
 * each worker runs `afterAll` when its own tests finish. So the cleanup
 * removes only the rows this worker created, by id. Removing by a shared
 * prefix would delete rows another worker is still reading.
 */

const E2E_DATABASE_URL =
  process.env.E2E_DATABASE_URL || 'mongodb://localhost:27018/boudreaux-e2e?replicaSet=rs0';

const prisma = new PrismaClient({ datasourceUrl: E2E_DATABASE_URL });

const PREFIX = 'e2e-credit-confirmation';

/** The rows this worker created, removed by id in `afterAll`. */
const created = { artistIds: [] as string[], releaseIds: [] as string[] };

interface SeededArtist {
  id: string;
  displayName: string;
}

const seedArtist = async (label: string, publishedOn?: Date): Promise<SeededArtist> => {
  const stamp = `${Date.now()}${Math.floor(Math.random() * 1e6)}`;
  const displayName = `E2E Credit ${label} ${stamp}`;
  const artist = await prisma.artist.create({
    data: {
      firstName: 'E2E',
      surname: label,
      slug: `${PREFIX}-${label.toLowerCase()}-${stamp}`,
      displayName,
      ...(publishedOn ? { publishedOn } : {}),
    },
  });
  created.artistIds.push(artist.id);
  return { id: artist.id, displayName };
};

const seedRelease = async (
  label: string,
  artists: SeededArtist[],
  publishedAt?: Date
): Promise<{ id: string; title: string }> => {
  const title = `E2E Credit ${label} ${Date.now()}${Math.floor(Math.random() * 1e6)}`;
  const release = await prisma.release.create({
    data: {
      title,
      releasedOn: new Date('2024-01-15T00:00:00.000Z'),
      coverArt: 'https://example.com/e2e-credit-confirmation.jpg',
      formats: ['DIGITAL'],
      ...(publishedAt ? { publishedAt } : {}),
    },
  });
  created.releaseIds.push(release.id);
  await prisma.artistRelease.createMany({
    data: artists.map(({ id }) => ({ artistId: id, releaseId: release.id })),
  });
  return { id: release.id, title };
};

test.describe('Credit confirmation (ADR-0015)', () => {
  test.afterAll(async () => {
    const { artistIds, releaseIds } = created;
    await prisma.artistRelease.deleteMany({
      where: { OR: [{ artistId: { in: artistIds } }, { releaseId: { in: releaseIds } }] },
    });
    await prisma.release.deleteMany({ where: { id: { in: releaseIds } } });
    await prisma.artist.deleteMany({ where: { id: { in: artistIds } } });
    await prisma.$disconnect();
  });

  test('publishing a release publishes only the artists the admin chose', async ({ adminPage }) => {
    const chosen = await seedArtist('Chosen');
    const keptHidden = await seedArtist('Kept');
    const release = await seedRelease('Publish', [chosen, keptHidden]);

    await adminPage.goto('/admin/releases');
    await adminPage.getByPlaceholder(/search releases/i).fill(release.title);
    const card = adminPage
      .locator('li:not([data-sonner-toast])')
      .filter({ hasText: release.title });
    await expect(card).toBeVisible({ timeout: 15_000 });

    await card.getByRole('button', { name: 'Publish', exact: true }).click();
    await adminPage.getByRole('button', { name: 'Confirm', exact: true }).click();

    // Both artists await a decision, and both start as kept hidden.
    const dialog = adminPage.getByRole('dialog', { name: 'Credited artists' });
    await expect(dialog).toBeVisible({ timeout: 15_000 });
    const chosenToggle = dialog.getByRole('switch', { name: `Publish ${chosen.displayName}` });
    const keptToggle = dialog.getByRole('switch', { name: `Publish ${keptHidden.displayName}` });
    await expect(chosenToggle).toHaveAttribute('aria-checked', 'false');
    await expect(keptToggle).toHaveAttribute('aria-checked', 'false');

    await chosenToggle.click();
    await dialog.getByRole('button', { name: 'Publish release', exact: true }).click();

    await expect(
      adminPage.getByText(`Successfully published release - ${release.title}`)
    ).toBeVisible({ timeout: 15_000 });

    const [releaseRow, chosenRow, keptRow] = await Promise.all([
      prisma.release.findUnique({ where: { id: release.id } }),
      prisma.artist.findUnique({ where: { id: chosen.id } }),
      prisma.artist.findUnique({ where: { id: keptHidden.id } }),
    ]);
    expect(releaseRow?.publishedAt).not.toBeNull();
    expect(chosenRow?.publishedOn).not.toBeNull();
    expect(chosenRow?.publishedBy).toBeTruthy();
    expect(keptRow?.publishedOn ?? null).toBeNull();
  });

  test('cancelling the confirmation publishes nothing', async ({ adminPage }) => {
    const artist = await seedArtist('Cancel');
    const release = await seedRelease('Cancel', [artist]);

    await adminPage.goto('/admin/releases');
    await adminPage.getByPlaceholder(/search releases/i).fill(release.title);
    const card = adminPage
      .locator('li:not([data-sonner-toast])')
      .filter({ hasText: release.title });
    await expect(card).toBeVisible({ timeout: 15_000 });

    await card.getByRole('button', { name: 'Publish', exact: true }).click();
    await adminPage.getByRole('button', { name: 'Confirm', exact: true }).click();

    const dialog = adminPage.getByRole('dialog', { name: 'Credited artists' });
    await expect(dialog).toBeVisible({ timeout: 15_000 });
    await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
    await expect(dialog).toBeHidden();

    const [releaseRow, artistRow] = await Promise.all([
      prisma.release.findUnique({ where: { id: release.id } }),
      prisma.artist.findUnique({ where: { id: artist.id } }),
    ]);
    expect(releaseRow?.publishedAt ?? null).toBeNull();
    expect(artistRow?.publishedOn ?? null).toBeNull();
  });

  test('a release whose artists are all public publishes without asking', async ({ adminPage }) => {
    const artist = await seedArtist('Public', new Date());
    const release = await seedRelease('Direct', [artist]);

    await adminPage.goto('/admin/releases');
    await adminPage.getByPlaceholder(/search releases/i).fill(release.title);
    const card = adminPage
      .locator('li:not([data-sonner-toast])')
      .filter({ hasText: release.title });
    await expect(card).toBeVisible({ timeout: 15_000 });

    await card.getByRole('button', { name: 'Publish', exact: true }).click();
    await adminPage.getByRole('button', { name: 'Confirm', exact: true }).click();

    await expect(
      adminPage.getByText(`Successfully published release - ${release.title}`)
    ).toBeVisible({ timeout: 15_000 });
    await expect(adminPage.getByRole('dialog', { name: 'Credited artists' })).toHaveCount(0);
  });

  test('archiving an artist warns which public work loses the name', async ({ adminPage }) => {
    const artist = await seedArtist('Hide', new Date());
    const release = await seedRelease('Hidden Byline', [artist], new Date());

    await adminPage.goto(`/admin/artists/${artist.id}`);
    await adminPage.getByRole('button', { name: 'Delete Artist', exact: true }).click();
    await adminPage.getByRole('button', { name: 'Delete', exact: true }).click();

    const warning = adminPage.getByRole('dialog', {
      name: 'This artist is credited on public work',
    });
    await expect(warning).toBeVisible({ timeout: 15_000 });
    // The artist is the release's only credit, so its album artist: hiding
    // it leaves the release with no byline, and the warning says so.
    await expect(
      warning.getByRole('region', { name: 'Left without a byline' }).getByText(release.title)
    ).toBeVisible();

    await warning.getByRole('button', { name: 'Hide artist', exact: true }).click();

    await expect(adminPage).toHaveURL('/admin/artists', { timeout: 15_000 });
    const [artistRow, releaseRow] = await Promise.all([
      prisma.artist.findUnique({ where: { id: artist.id } }),
      prisma.release.findUnique({ where: { id: release.id } }),
    ]);
    expect(artistRow?.deletedOn).not.toBeNull();
    // Hiding the artist never hides the work that credits it.
    expect(releaseRow?.publishedAt).not.toBeNull();
  });
});
