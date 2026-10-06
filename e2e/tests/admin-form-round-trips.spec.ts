/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { randomUUID } from 'node:crypto';

import { PrismaClient } from '@prisma/client';

import { expect, test } from '../fixtures/auth.fixture';

import type { Page } from '@playwright/test';

/**
 * What an admin types into the artist and release forms is what is stored.
 * These were manual smokes after #788 (an optional field can be emptied) and
 * #791 (a numeric-looking string stays a string).
 *
 * Each test seeds and edits its own rows, stamped per worker and dated in
 * 2000, so no other spec reads them. Rows are removed by id.
 */

const E2E_DATABASE_URL =
  process.env.E2E_DATABASE_URL || 'mongodb://localhost:27018/boudreaux-e2e?replicaSet=rs0';

const prisma = new PrismaClient({ datasourceUrl: E2E_DATABASE_URL });

const STAMP = randomUUID().slice(0, 8);
const PAST = new Date('2000-01-01T00:00:00.000Z');

const made = { artists: [] as string[], releases: [] as string[] };

const createArtist = async (data: {
  firstName: string;
  surname: string;
  slug: string;
  displayName?: string;
  suffix?: string;
  shortBio?: string;
}): Promise<string> => {
  const { id } = await prisma.artist.create({
    data: { ...data, publishedOn: PAST },
    select: { id: true },
  });
  made.artists.push(id);
  return id;
};

const createDraftRelease = async (data: {
  title: string;
  catalogNumber?: string;
  suggestedPrice?: number;
}): Promise<string> => {
  const artistId = await createArtist({
    firstName: 'ZZ',
    surname: `Round Trip Credit ${STAMP}-${made.releases.length}`,
    slug: `e2e-round-trip-credit-${STAMP}-${made.releases.length}`,
  });
  const { id } = await prisma.release.create({
    data: {
      ...data,
      releasedOn: PAST,
      coverArt: 'https://example.com/e2e-round-trip.jpg',
      formats: ['DIGITAL'],
    },
    select: { id: true },
  });
  made.releases.push(id);
  await prisma.artistRelease.create({ data: { artistId, releaseId: id, position: 0 } });
  return id;
};

/** Save the open form and wait for its success toast. */
const save = async (page: Page): Promise<void> => {
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByText(/saved successfully/i)).toBeVisible({ timeout: 15_000 });
};

test.afterAll(async () => {
  if (made.releases.length > 0) {
    await prisma.artistRelease.deleteMany({ where: { releaseId: { in: made.releases } } });
    await prisma.release.deleteMany({ where: { id: { in: made.releases } } });
  }
  if (made.artists.length > 0) {
    await prisma.artist.deleteMany({ where: { id: { in: made.artists } } });
  }
  await prisma.$disconnect();
});

test.describe('Admin form round trips', () => {
  // #788: a cleared optional field is stored cleared, and the public name
  // falls back to first name + surname.
  test('stores an emptied suffix and display name on an artist', async ({ adminPage }) => {
    const surname = `Clear ${STAMP}`;
    const id = await createArtist({
      firstName: 'ZZ',
      surname,
      slug: `e2e-clear-${STAMP}`,
      displayName: `ZZ Shown ${STAMP}`,
      suffix: 'Jr.',
    });

    await adminPage.goto(`/admin/artists/${id}`);
    await expect(adminPage.locator('[name="suffix"]')).toHaveValue('Jr.', { timeout: 15_000 });
    await adminPage.locator('[name="suffix"]').fill('');
    await adminPage.locator('[name="displayName"]').fill('');
    await save(adminPage);

    await adminPage.reload();
    await expect(adminPage.locator('[name="suffix"]')).toHaveValue('', { timeout: 15_000 });
    await expect(adminPage.locator('[name="displayName"]')).toHaveValue('');
    const row = await prisma.artist.findUniqueOrThrow({
      where: { id },
      select: { suffix: true, displayName: true },
    });
    expect({ suffix: row.suffix ?? '', displayName: row.displayName ?? '' }).toEqual({
      suffix: '',
      displayName: '',
    });

    const response = await adminPage.request.get(`/api/artists/slug/e2e-clear-${STAMP}`);
    const body = await response.text();
    expect(body).not.toContain(`ZZ Shown ${STAMP}`);
    expect(body).not.toContain('Jr.');
  });

  test('stores an emptied catalog number on a release', async ({ adminPage }) => {
    const id = await createDraftRelease({
      title: `E2E Clear Release ${STAMP}`,
      catalogNumber: `CAT-${STAMP}`,
    });

    await adminPage.goto(`/admin/releases/${id}`);
    await expect(adminPage.locator('[name="catalogNumber"]')).toHaveValue(`CAT-${STAMP}`, {
      timeout: 15_000,
    });
    await adminPage.locator('[name="catalogNumber"]').fill('');
    await save(adminPage);

    await adminPage.reload();
    await expect(adminPage.locator('[name="catalogNumber"]')).toHaveValue('', {
      timeout: 15_000,
    });
    const row = await prisma.release.findUniqueOrThrow({
      where: { id },
      select: { catalogNumber: true },
    });
    expect(row.catalogNumber ?? '').toBe('');
  });

  // #791: the form posts strings; a title, catalog number or price that looks
  // like a number must come back exactly as typed.
  test('keeps a numeric-looking title, catalog number and price as typed', async ({
    adminPage,
  }) => {
    const id = await createDraftRelease({
      title: `E2E Numeric ${STAMP}`,
      suggestedPrice: 799,
    });

    await adminPage.goto(`/admin/releases/${id}`);
    await expect(adminPage.locator('[name="suggestedPrice"]')).toHaveValue('7.99', {
      timeout: 15_000,
    });
    await adminPage.locator('[name="title"]').fill('1999');
    await adminPage.locator('[name="catalogNumber"]').fill('001');
    await save(adminPage);

    const row = await prisma.release.findUniqueOrThrow({
      where: { id },
      select: { title: true, catalogNumber: true, suggestedPrice: true },
    });
    expect(row).toEqual({ title: '1999', catalogNumber: '001', suggestedPrice: 799 });
  });
});
