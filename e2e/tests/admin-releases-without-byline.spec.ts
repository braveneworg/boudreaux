/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { PrismaClient } from '@prisma/client';

import { expect, test } from '../fixtures/auth.fixture';

/**
 * E2E coverage for ADR-0015's "legitimate, but never silent": a published
 * release whose album artist (first credit) is hidden shows no byline, and
 * the admin dashboard's Releases tile says so and links to those releases.
 *
 * The spec seeds one such release: its only credit is an archived artist.
 * The dashboard count includes other specs' rows too, so the spec asserts
 * the warning is there and that its list holds this release, never a count.
 *
 * Parallel safety: both tests read the rows one `beforeAll` seeded, so the
 * file runs in a single worker (`mode: 'default'`). The rows carry this
 * worker's `STAMP` and are removed by id. The release is dated in 2000 so
 * it never leads a newest-first public listing another spec reads.
 */

const E2E_DATABASE_URL =
  process.env.E2E_DATABASE_URL || 'mongodb://localhost:27018/boudreaux-e2e?replicaSet=rs0';

const prisma = new PrismaClient({ datasourceUrl: E2E_DATABASE_URL });

// Unique per worker process: a module is loaded once in each worker.
const STAMP = `${Date.now()}${Math.floor(Math.random() * 1e6)}`;
const RELEASE_TITLE = `E2E No Byline ${STAMP}`;

let artistId: string | undefined;
let releaseId: string | undefined;

test.describe.configure({ mode: 'default' });

test.beforeAll(async () => {
  const past = new Date('2000-01-01T00:00:00.000Z');
  const archived = await prisma.artist.create({
    data: {
      firstName: 'E2E',
      surname: `Archived Lead ${STAMP}`,
      slug: `e2e-archived-lead-${STAMP}`,
      publishedOn: past,
      deletedOn: past,
    },
    select: { id: true },
  });
  artistId = archived.id;
  const release = await prisma.release.create({
    data: {
      title: RELEASE_TITLE,
      releasedOn: past,
      coverArt: 'https://cdn.example.com/e2e-no-byline.webp',
      formats: ['DIGITAL'],
      publishedAt: past,
    },
    select: { id: true },
  });
  releaseId = release.id;
  await prisma.artistRelease.create({ data: { artistId, releaseId, position: 0 } });
});

test.afterAll(async () => {
  if (releaseId) {
    await prisma.artistRelease.deleteMany({ where: { releaseId } });
    await prisma.release.delete({ where: { id: releaseId } });
  }
  if (artistId) {
    await prisma.artist.delete({ where: { id: artistId } });
  }
  await prisma.$disconnect();
});

test.describe('Releases without a byline', () => {
  test('the dashboard warns about them and links to the list of them', async ({ adminPage }) => {
    await adminPage.goto('/admin');

    const warning = adminPage
      .getByRole('list', { name: /section overview/i })
      .getByRole('link', { name: /published without a byline/ });
    await expect(warning).toBeVisible();
    await warning.click();

    await expect(adminPage).toHaveURL(/\/admin\/releases\?byline=missing$/);
    await expect(adminPage.getByText('Published releases without a byline')).toBeVisible();
    await adminPage.getByPlaceholder('Search releases...').fill(RELEASE_TITLE);
    await expect(adminPage.getByText(RELEASE_TITLE)).toBeVisible();
  });

  test('the list leaves the view for every release', async ({ adminPage }) => {
    await adminPage.goto('/admin/releases?byline=missing');

    await adminPage.getByRole('link', { name: 'Show all releases' }).click();

    await expect(adminPage).toHaveURL(/\/admin\/releases$/);
    await expect(adminPage.getByText('Published releases without a byline')).toHaveCount(0);
  });
});
