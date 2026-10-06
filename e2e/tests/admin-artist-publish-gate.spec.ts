/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { randomUUID } from 'node:crypto';

import { PrismaClient } from '@prisma/client';

import { expect, test } from '../fixtures/auth.fixture';

/**
 * E2E coverage for ADR-0019: publishing an artist needs a chosen display
 * image, and a published artist keeps at least one. The edit form's Publish
 * button stays disabled, with the reason, until an image is chosen; the
 * strip's remove control and the pool's delete control refuse a published
 * artist's last chosen image until another joins the set.
 *
 * Each test seeds its own artist, stamped per worker, and the worker removes
 * the rows it made by id.
 */

const E2E_DATABASE_URL =
  process.env.E2E_DATABASE_URL || 'mongodb://localhost:27018/boudreaux-e2e?replicaSet=rs0';

const prisma = new PrismaClient({ datasourceUrl: E2E_DATABASE_URL });

const PAST = new Date('2000-01-01T00:00:00.000Z');
const made: string[] = [];

interface ImageSeed {
  title: string;
  /** Set to make the image a chosen display image. */
  displayOrder?: number;
}

/**
 * An artist with an image pool. Every seed takes a fresh stamp, so repeated
 * copies of a test in one worker never collide on the slug, and the titles
 * carry it so locators are unique.
 */
const seedArtist = async (
  label: string,
  images: ImageSeed[],
  publishedOn?: Date
): Promise<{ id: string; titles: string[] }> => {
  const stamp = randomUUID().slice(0, 8);
  const key = label.toLowerCase();
  const rows = images.map(({ title, displayOrder }, index) => ({
    url: `https://example.com/e2e-gate-${key}-${index}-${stamp}.jpg`,
    title: `${title} ${stamp}`,
    alt: `${title} ${stamp} described`,
    origin: 'custom',
    sortOrder: index,
    ...(displayOrder === undefined ? {} : { displayOrder }),
  }));
  const { id } = await prisma.artist.create({
    data: {
      firstName: 'ZZ',
      surname: `E2E Gate ${label} ${stamp}`,
      displayName: `ZZ E2E Gate ${label} ${stamp}`,
      slug: `e2e-gate-${key}-${stamp}`,
      ...(publishedOn ? { publishedOn } : {}),
      bioImages: { create: rows },
    },
    select: { id: true },
  });
  made.push(id);
  return { id, titles: rows.map(({ title }) => title) };
};

test.afterAll(async () => {
  await prisma.artistBioImage.deleteMany({ where: { artistId: { in: made } } });
  await prisma.artist.deleteMany({ where: { id: { in: made } } });
  await prisma.$disconnect();
});

test.describe('Artist publish gate (ADR-0019)', () => {
  test('Publish stays disabled, with the reason, until a display image is chosen', async ({
    adminPage,
  }) => {
    const {
      id,
      titles: [title],
    } = await seedArtist('Unpublished', [{ title: 'Pooled' }]);

    await adminPage.goto(`/admin/artists/${id}`);

    const publish = adminPage.getByRole('button', { name: 'Publish', exact: true });
    await expect(publish).toBeVisible({ timeout: 15_000 });
    await expect(publish).toBeDisabled();
    await expect(publish).toHaveAccessibleDescription(/choose at least one display image/i);

    const use = adminPage.getByRole('button', { name: `Use ${title} as display image` });
    await expect(use).toBeEnabled({ timeout: 15_000 });
    await use.click();
    const strip = adminPage.getByRole('list', { name: 'Display images' });
    await expect(strip.getByRole('listitem', { name: `${title}, display image` })).toBeVisible({
      timeout: 15_000,
    });

    await expect(publish).toBeEnabled();
    await publish.click();

    await expect(adminPage.getByText(/published successfully/i)).toBeVisible({ timeout: 15_000 });
    await expect(adminPage.getByRole('button', { name: 'Published', exact: true })).toBeDisabled();
    const row = await prisma.artist.findUnique({ where: { id }, select: { publishedOn: true } });
    expect(row?.publishedOn).not.toBeNull();
  });

  test("a published artist's last display image can be neither removed nor deleted", async ({
    adminPage,
  }) => {
    const {
      id,
      titles: [chosen, spare],
    } = await seedArtist(
      'Published',
      [{ title: 'Chosen', displayOrder: 0 }, { title: 'Spare' }],
      PAST
    );

    await adminPage.goto(`/admin/artists/${id}`);

    const remove = adminPage.getByRole('button', { name: `Remove ${chosen} from display images` });
    await expect(remove).toBeVisible({ timeout: 15_000 });
    await expect(remove).toBeDisabled();
    await expect(remove).toHaveAccessibleDescription(/keeps at least one display image/i);

    const deleteChosen = adminPage.getByRole('button', { name: `Delete image ${chosen}` });
    await expect(deleteChosen).toBeDisabled();
    await expect(deleteChosen).toHaveAccessibleDescription(/keeps at least one display image/i);
    await expect(adminPage.getByRole('button', { name: `Delete image ${spare}` })).toBeEnabled();

    // Once another image joins the set, the first one may leave it.
    await adminPage.getByRole('button', { name: `Use ${spare} as display image` }).click();
    const strip = adminPage.getByRole('list', { name: 'Display images' });
    await expect(strip.getByRole('listitem', { name: `${spare}, display image` })).toBeVisible({
      timeout: 15_000,
    });
    await expect(remove).toBeEnabled();
    await expect(deleteChosen).toBeEnabled();
  });
});
