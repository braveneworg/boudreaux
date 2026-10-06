/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { PrismaClient } from '@prisma/client';

import { expect, test } from '../fixtures/auth.fixture';

import type { Page } from '@playwright/test';

/**
 * Bio image uploads on the artist editor (#749, #789, #794). An upload with no
 * alt text takes the artist's name, so it can be shown; an upload joins the
 * display images while there is room; a file dropped on "Add a display image"
 * uploads and joins them too. Uploads land in the E2E upload sink
 * (upload-local-adapter.ts). Each test edits its own stamped artist.
 */

const E2E_DATABASE_URL =
  process.env.E2E_DATABASE_URL || 'mongodb://localhost:27018/boudreaux-e2e?replicaSet=rs0';

const prisma = new PrismaClient({ datasourceUrl: E2E_DATABASE_URL });

const STAMP = randomUUID().slice(0, 8);
const IMAGE = resolve('public/icons/icon-192.png');
const artistIds: string[] = [];

const seedArtist = async (label: string): Promise<{ id: string; name: string }> => {
  const name = `ZZ E2E Upload ${label} ${STAMP}`;
  const { id } = await prisma.artist.create({
    data: {
      firstName: 'ZZ',
      surname: `E2E Upload ${label} ${STAMP}`,
      displayName: name,
      slug: `e2e-upload-${label.toLowerCase()}-${STAMP}`,
    },
    select: { id: true },
  });
  artistIds.push(id);
  return { id, name };
};

const storedImages = (artistId: string) =>
  prisma.artistBioImage.findMany({
    where: { artistId },
    select: { alt: true, url: true, displayOrder: true },
  });

const displayStrip = (page: Page) => page.getByRole('list', { name: 'Display images' });

test.afterAll(async () => {
  await prisma.artistBioImage.deleteMany({ where: { artistId: { in: artistIds } } });
  await prisma.artist.deleteMany({ where: { id: { in: artistIds } } });
  await prisma.$disconnect();
});

test.describe('Admin bio image upload', () => {
  test('an upload with no alt takes the artist name and is shown', async ({ adminPage }) => {
    const { id, name } = await seedArtist('Blank');
    await adminPage.goto(`/admin/artists/${id}`);

    await adminPage.getByLabel('Upload bio image').setInputFiles(IMAGE);

    await expect(displayStrip(adminPage).getByRole('listitem')).toHaveCount(1, {
      timeout: 20_000,
    });
    // The strip updates at once; the display-image save lands just after.
    await expect(async () => {
      const [image] = await storedImages(id);
      expect(image).toMatchObject({ alt: name, displayOrder: 0 });
    }).toPass({ timeout: 15_000 });
  });

  test('an upload with alt text keeps it and is shown', async ({ adminPage }) => {
    const { id } = await seedArtist('Alt');
    await adminPage.goto(`/admin/artists/${id}`);

    await adminPage.getByLabel('Alt text').fill(`E2E custom alt ${STAMP}`);
    await adminPage.getByLabel('Upload bio image').setInputFiles(IMAGE);

    await expect(displayStrip(adminPage).getByRole('listitem')).toHaveCount(1, {
      timeout: 20_000,
    });
    // The strip updates at once; the display-image save lands just after.
    await expect(async () => {
      const [image] = await storedImages(id);
      expect(image).toMatchObject({ alt: `E2E custom alt ${STAMP}`, displayOrder: 0 });
    }).toPass({ timeout: 15_000 });
  });

  test('a file dropped on "Add a display image" uploads and is shown', async ({ adminPage }) => {
    const { id, name } = await seedArtist('Drop');
    await adminPage.goto(`/admin/artists/${id}`);

    const target = adminPage.getByRole('group', { name: 'Add a display image' });
    await expect(target).toBeVisible({ timeout: 15_000 });
    const bytes = [...readFileSync(IMAGE)];
    const dataTransfer = await adminPage.evaluateHandle((data) => {
      const transfer = new DataTransfer();
      transfer.items.add(new File([new Uint8Array(data)], 'dropped.png', { type: 'image/png' }));
      return transfer;
    }, bytes);
    await target.dispatchEvent('dragover', { dataTransfer });
    await target.dispatchEvent('drop', { dataTransfer });

    await expect(displayStrip(adminPage).getByRole('listitem')).toHaveCount(1, {
      timeout: 20_000,
    });
    // The strip updates at once; the display-image save lands just after.
    await expect(async () => {
      const [image] = await storedImages(id);
      expect(image).toMatchObject({ alt: name, displayOrder: 0 });
    }).toPass({ timeout: 15_000 });
  });
});
