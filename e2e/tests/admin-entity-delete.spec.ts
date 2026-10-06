/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { PrismaClient } from '@prisma/client';

import { expect, test } from '../fixtures/auth.fixture';

import type { Page } from '@playwright/test';

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
    // (the list can hold other artists, so scope to the matching <li> —
    // excluding Sonner toast <li>s, see the restore step below).
    await adminPage.getByPlaceholder(/search artists/i).fill(displayName);
    const card = adminPage.locator('li:not([data-sonner-toast])').filter({ hasText: displayName });
    await expect(card).toBeVisible({ timeout: 15_000 });

    await card.getByRole('button', { name: 'Delete', exact: true }).click();
    await adminPage.getByRole('button', { name: 'Confirm', exact: true }).click();

    await expect(adminPage.getByText(`Successfully deleted artist - ${displayName}`)).toBeVisible({
      timeout: 15_000,
    });

    // Reveal soft-deleted rows and restore it from its card. Exclude Sonner
    // toasts: the "Successfully deleted artist - {name}" toast is itself an
    // <li> containing the display name, so a bare `li` filter matches both it
    // and the card (strict-mode violation). Scope to non-toast list items.
    await adminPage.getByRole('switch', { name: /show deleted/i }).click();
    const deletedCard = adminPage
      .locator('li:not([data-sonner-toast])')
      .filter({ hasText: displayName });
    await expect(deletedCard).toBeVisible({ timeout: 15_000 });

    await deletedCard.getByRole('button', { name: 'Restore', exact: true }).click();
    await adminPage.getByRole('button', { name: 'Confirm', exact: true }).click();

    await expect(adminPage.getByText(`Successfully restored artist - ${displayName}`)).toBeVisible({
      timeout: 15_000,
    });

    const row = await prisma.artist.findUnique({ where: { id } });
    expect(row?.deletedOn).toBeNull();
  });

  // #703 and #830: Delete Forever, offered on an archived row, removes the
  // artist and every row that credits it, keeps the work, and leaves each
  // release's remaining credits numbered 0..n-1. It is refused for a
  // release's album artist (first credit), naming the release.
  test.describe('Delete Forever', () => {
    const stamp = `${Date.now()}${Math.floor(Math.random() * 1e6)}`;
    const PAST = new Date('2000-01-01T00:00:00.000Z');
    const made = { artists: [] as string[], releases: [] as string[], videos: [] as string[] };

    const artist = async (label: string, archived: boolean) => {
      const displayName = `E2E Forever ${label} ${stamp}`;
      const { id } = await prisma.artist.create({
        data: {
          firstName: 'E2E',
          surname: `Forever ${label}`,
          slug: `e2e-forever-${label.toLowerCase()}-${stamp}`,
          displayName,
          publishedOn: PAST,
          ...(archived ? { deletedOn: PAST } : {}),
        },
        select: { id: true },
      });
      made.artists.push(id);
      return { id, displayName };
    };

    const release = async (label: string, credited: string[]) => {
      const title = `E2E Forever ${label} ${stamp}`;
      const { id } = await prisma.release.create({
        data: {
          title,
          releasedOn: PAST,
          coverArt: 'https://example.com/e2e-forever.jpg',
          formats: ['DIGITAL'],
          publishedAt: PAST,
        },
        select: { id: true },
      });
      made.releases.push(id);
      await prisma.artistRelease.createMany({
        data: credited.map((artistId, position) => ({ artistId, releaseId: id, position })),
      });
      return { id, title };
    };

    /** Open the archived row and confirm its permanent delete. */
    const deleteForever = async (page: Page, displayName: string) => {
      await page.goto('/admin/artists');
      await page.getByRole('switch', { name: /show deleted/i }).click();
      await page.getByPlaceholder(/search artists/i).fill(displayName);
      const card = page.locator('li:not([data-sonner-toast])').filter({ hasText: displayName });
      await expect(card).toBeVisible({ timeout: 15_000 });
      await card.getByRole('button', { name: 'Delete Forever', exact: true }).click();
      await page.getByRole('button', { name: 'Confirm', exact: true }).click();
    };

    test.afterAll(async () => {
      await prisma.artistRelease.deleteMany({ where: { releaseId: { in: made.releases } } });
      await prisma.release.deleteMany({ where: { id: { in: made.releases } } });
      await prisma.videoArtist.deleteMany({ where: { videoId: { in: made.videos } } });
      await prisma.video.deleteMany({ where: { id: { in: made.videos } } });
      await prisma.artistBioImage.deleteMany({ where: { artistId: { in: made.artists } } });
      await prisma.artistUrl.deleteMany({ where: { artistId: { in: made.artists } } });
      await prisma.artist.deleteMany({ where: { id: { in: made.artists } } });
    });

    test('removes the artist and every credit, keeping the work', async ({ adminPage }) => {
      const lead = await artist('Lead', false);
      const guest = await artist('Guest', true);
      const tail = await artist('Tail', false);
      const shared = await release('Shared', [lead.id, guest.id, tail.id]);
      const { id: videoId } = await prisma.video.create({
        data: {
          title: `E2E Forever Video ${stamp}`,
          artist: guest.displayName,
          category: 'MUSIC',
          s3Key: `media/videos/e2e-forever-${stamp}.mp4`,
          fileName: 'e2e-forever.mp4',
          mimeType: 'video/mp4',
        },
        select: { id: true },
      });
      made.videos.push(videoId);
      await prisma.videoArtist.create({ data: { videoId, artistId: guest.id } });
      await prisma.artistBioImage.create({
        data: { artistId: guest.id, url: 'https://example.com/e2e-forever-bio.jpg' },
      });
      await prisma.artistUrl.create({
        data: { artistId: guest.id, platform: 'BANDCAMP', url: 'https://example.com/e2e-forever' },
      });

      await deleteForever(adminPage, guest.displayName);

      await expect(
        adminPage.getByText(`Successfully permanently deleted artist - ${guest.displayName}`)
      ).toBeVisible({ timeout: 15_000 });
      const [row, joins, video, credits] = await Promise.all([
        prisma.artist.findUnique({ where: { id: guest.id } }),
        Promise.all([
          prisma.artistRelease.count({ where: { artistId: guest.id } }),
          prisma.videoArtist.count({ where: { artistId: guest.id } }),
          prisma.artistBioImage.count({ where: { artistId: guest.id } }),
          prisma.artistUrl.count({ where: { artistId: guest.id } }),
        ]),
        prisma.video.findUnique({ where: { id: videoId }, select: { id: true } }),
        prisma.artistRelease.findMany({
          where: { releaseId: shared.id },
          orderBy: [{ position: 'asc' }, { id: 'asc' }],
          select: { artistId: true, position: true },
        }),
      ]);
      expect({ row, joins, video: video?.id, credits }).toEqual({
        row: null,
        joins: [0, 0, 0, 0],
        video: videoId,
        credits: [
          { artistId: lead.id, position: 0 },
          { artistId: tail.id, position: 1 },
        ],
      });
    });

    test("is refused for a release's album artist, naming the release", async ({ adminPage }) => {
      const lead = await artist('Album', true);
      const led = await release('Led', [lead.id]);

      await deleteForever(adminPage, lead.displayName);

      await expect(
        adminPage.getByText(
          `Failed to permanently delete artist: This artist is the album artist of ${led.title}.`,
          { exact: false }
        )
      ).toBeVisible({ timeout: 15_000 });
      expect(
        await prisma.artist.findUnique({ where: { id: lead.id }, select: { id: true } })
      ).toEqual({ id: lead.id });
    });
  });
});
