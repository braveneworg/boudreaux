/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { randomUUID } from 'node:crypto';

import { PrismaClient } from '@prisma/client';

import { expect, test } from '../fixtures/auth.fixture';

/**
 * The release form's "Or select from artist images" picker browses the
 * credited artist's bio images with the display images first, in their
 * order, then the job's suggestion, then the rest (#749). This was a manual
 * smoke after #749.
 *
 * The spec seeds a draft release credited to its own artist, stamped per
 * worker and removed by id.
 */

const E2E_DATABASE_URL =
  process.env.E2E_DATABASE_URL || 'mongodb://localhost:27018/boudreaux-e2e?replicaSet=rs0';

const prisma = new PrismaClient({ datasourceUrl: E2E_DATABASE_URL });

const STAMP = randomUUID().slice(0, 8);
const PAST = new Date('2000-01-01T00:00:00.000Z');

let artistId = '';
let releaseId = '';

const image = (
  title: string,
  order: { sortOrder: number; displayOrder?: number; isPrimary?: boolean }
) => ({
  artistId,
  url: `https://example.com/e2e-picker-${title.toLowerCase().replace(/\s+/g, '-')}-${STAMP}.jpg`,
  title: `${title} ${STAMP}`,
  alt: `${title} described`,
  ...order,
});

test.beforeAll(async () => {
  ({ id: artistId } = await prisma.artist.create({
    data: {
      firstName: 'ZZ',
      surname: `E2E Picker ${STAMP}`,
      slug: `e2e-picker-${STAMP}`,
      publishedOn: PAST,
    },
    select: { id: true },
  }));
  // Stored in an order that differs from the expected one: pool, suggestion,
  // second display image, first display image.
  await prisma.artistBioImage.createMany({
    data: [
      image('Pool', { sortOrder: 0 }),
      image('Suggestion', { sortOrder: 1, isPrimary: true }),
      image('Display B', { sortOrder: 2, displayOrder: 1 }),
      image('Display A', { sortOrder: 3, displayOrder: 0 }),
    ],
  });
  ({ id: releaseId } = await prisma.release.create({
    data: {
      title: `E2E Picker Release ${STAMP}`,
      releasedOn: PAST,
      coverArt: 'https://example.com/e2e-picker-cover.jpg',
      formats: ['DIGITAL'],
    },
    select: { id: true },
  }));
  await prisma.artistRelease.create({ data: { artistId, releaseId, position: 0 } });
});

test.afterAll(async () => {
  if (releaseId) {
    await prisma.artistRelease.deleteMany({ where: { releaseId } });
    await prisma.release.delete({ where: { id: releaseId } });
  }
  if (artistId) {
    await prisma.artistBioImage.deleteMany({ where: { artistId } });
    await prisma.artist.delete({ where: { id: artistId } });
  }
  await prisma.$disconnect();
});

test('the cover-art picker lists the display images first, in order', async ({ adminPage }) => {
  await adminPage.goto(`/admin/releases/${releaseId}`);
  // A combobox takes no name from its content, so it is found by its text.
  const picker = adminPage
    .getByRole('combobox')
    .filter({ hasText: 'Choose from artist images...' });
  await expect(picker).toBeEnabled({ timeout: 15_000 });

  await picker.click();

  const options = adminPage.getByRole('option');
  await expect(options).toHaveCount(4, { timeout: 15_000 });
  await expect(options).toHaveText([
    new RegExp(`Display A ${STAMP}`),
    new RegExp(`Display B ${STAMP}`),
    new RegExp(`Suggestion ${STAMP}`),
    new RegExp(`Pool ${STAMP}`),
  ]);
});
