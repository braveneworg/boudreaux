/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { randomUUID } from 'node:crypto';

import { PrismaClient } from '@prisma/client';

import { expect, test } from '../../fixtures/base.fixture';

/**
 * The public artist reads, as an anonymous visitor makes them. These were
 * manual smokes after #745, #746, #755, #785, #792 and #796; each test below
 * is one of them.
 *
 * The spec seeds its own rows, stamped per worker, so it changes no seeded
 * count another spec reads: an artist carrying every private field and a bio,
 * a band it belongs to, an artist it is a guest of, a draft, and a published
 * artist with no release. All are dated in 2000 so they never lead a
 * newest-first listing.
 *
 * Parallel safety: every test reads the rows one `beforeAll` seeded, so the
 * file runs in one worker (`mode: 'default'`). Rows are removed by id.
 */

const E2E_DATABASE_URL =
  process.env.E2E_DATABASE_URL || 'mongodb://localhost:27018/boudreaux-e2e?replicaSet=rs0';

const prisma = new PrismaClient({ datasourceUrl: E2E_DATABASE_URL });

const STAMP = randomUUID().slice(0, 8);
const PAST = new Date('2000-01-01T00:00:00.000Z');

const slugOf = (label: string): string => `e2e-api-${label}-${STAMP}`;
const UNLISTED_NAME = `ZZ E2E Unlisted ${STAMP}`;
const BORN_NAME = `ZZ E2E Born ${STAMP}`;

/** Fields that live on an artist row and must never reach a public payload. */
const PRIVATE_KEY =
  /^(email|phone|address1|address2|city|state|postalCode|country|notes|createdBy|updatedBy|publishedBy|deletedBy|deactivatedBy|reactivatedBy|bioError|bioProgress|bioStartedAt|bioJobToken|imageLinks)$/;
/** A release's `notes` are its public liner notes, not the artist's private notes. */
const isReleaseNotes = (path: string): boolean => /\.release\.notes$/.test(path);
/** A bio is shown only on its own artist's page, never on a nested artist. */
const BIO_KEY = /^(bio|shortBio|altBio)$/;

interface KeyAt {
  /** Dotted path to the key, array indexes as `[]`. */
  path: string;
  key: string;
  depth: number;
}

/** Every key of a JSON value with its path and depth (0 = top level). */
const keysOf = (value: unknown, path = '', depth = 0): KeyAt[] => {
  if (Array.isArray(value)) {
    return value.flatMap((item) => keysOf(item, `${path}[]`, depth));
  }
  if (value && typeof value === 'object') {
    return Object.entries(value).flatMap(([key, child]) => [
      { path: `${path}.${key}`, key, depth },
      ...keysOf(child, `${path}.${key}`, depth + 1),
    ]);
  }
  return [];
};

const artistIds: string[] = [];
const releaseIds: string[] = [];
let leadId = '';

const createArtist = async (
  label: string,
  data: { displayName?: string; publishedOn?: Date } & Record<string, unknown> = {}
): Promise<string> => {
  const { id } = await prisma.artist.create({
    data: {
      // "ZZ" files these rows after every seeded artist in the A–Z index, so
      // they never displace a row another spec expects first.
      firstName: 'ZZ',
      surname: `E2E API ${label} ${STAMP}`,
      displayName: `ZZ E2E API ${label} ${STAMP}`,
      slug: slugOf(label),
      ...data,
    },
    select: { id: true },
  });
  artistIds.push(id);
  return id;
};

const createRelease = async (label: string, credited: string[]): Promise<void> => {
  const { id } = await prisma.release.create({
    data: {
      title: `E2E API ${label} ${STAMP}`,
      releasedOn: PAST,
      coverArt: 'https://example.com/e2e-api.jpg',
      formats: ['DIGITAL'],
      publishedAt: PAST,
    },
    select: { id: true },
  });
  releaseIds.push(id);
  await prisma.artistRelease.createMany({
    data: credited.map((artistId, position) => ({ artistId, releaseId: id, position })),
  });
};

test.describe.configure({ mode: 'default' });

test.beforeAll(async () => {
  leadId = await createArtist('lead', {
    publishedOn: PAST,
    bio: '<p>E2E lead bio.</p>',
    shortBio: 'E2E lead short bio.',
    email: 'lead@example.com',
    phone: '555-0100',
    address1: '1 Private Street',
    notes: ['internal note'],
    bioJobToken: 'e2e-job-token',
    createdBy: 'e2e-admin',
    publishedBy: 'e2e-admin',
  });
  const host = await createArtist('host', { publishedOn: PAST });
  const band = await createArtist('band', { publishedOn: PAST });
  await createArtist('draft');
  await createArtist('unlisted', { displayName: UNLISTED_NAME, publishedOn: PAST });
  const born = await createArtist('born', {
    displayName: BORN_NAME,
    publishedOn: PAST,
    bornOn: new Date('1984-06-01T00:00:00.000Z'),
  });
  await prisma.artistMember.create({ data: { artistId: band, memberId: leadId } });

  await createRelease('own', [leadId]);
  await createRelease('guest', [host, leadId]);
  await createRelease('band', [band]);
  await createRelease('born', [born]);
});

test.afterAll(async () => {
  if (releaseIds.length > 0) {
    await prisma.artistRelease.deleteMany({ where: { releaseId: { in: releaseIds } } });
    await prisma.release.deleteMany({ where: { id: { in: releaseIds } } });
  }
  if (artistIds.length > 0) {
    await prisma.artistMember.deleteMany({ where: { memberId: { in: artistIds } } });
    await prisma.artist.deleteMany({ where: { id: { in: artistIds } } });
  }
  await prisma.$disconnect();
});

test.describe('Public artist reads', () => {
  // #785: the payloads are projected to public scalars, and the route parses
  // them through the public schema as a guard.
  test('carry no private field at any depth', async ({ request }) => {
    const plain = await request.get(`/api/artists/slug/${slugOf('lead')}`);
    const full = await request.get(`/api/artists/slug/${slugOf('lead')}?withReleases=true`);
    expect([plain.status(), full.status()]).toEqual([200, 200]);

    const leaked = [...keysOf(await plain.json()), ...keysOf(await full.json())]
      .filter(({ key, path }) => PRIVATE_KEY.test(key) && !isReleaseNotes(path))
      .map(({ path }) => path);

    expect(leaked).toEqual([]);
  });

  test('keep the by-id read for admins', async ({ request }) => {
    const response = await request.get(`/api/artists/${leadId}`);

    expect(response.status()).toBe(401);
  });

  // #796: a bio is shown only on its artist's own page.
  test('carry no bio on a nested artist', async ({ request }) => {
    const band = await request.get(`/api/artists/slug/${slugOf('band')}?withReleases=true`);
    const lead = await request.get(`/api/artists/slug/${slugOf('lead')}?withReleases=true`);

    const nestedBio = [...keysOf(await band.json()), ...keysOf(await lead.json())]
      .filter(({ key, depth }) => depth > 0 && BIO_KEY.test(key))
      .map(({ path }) => path);

    expect(nestedBio).toEqual([]);
  });

  // #792: a draft artist exists for nobody but the admin. The page streams
  // the root loading shell before it looks the artist up, so its not-found
  // answer is a soft 404 (status 200, `noindex`), as Next documents for a
  // notFound() after streaming starts; the API answers a real 404.
  test('answer 404 for a draft artist, and show the page as not found', async ({
    request,
    page,
  }) => {
    const plain = await request.get(`/api/artists/slug/${slugOf('draft')}`);
    const full = await request.get(`/api/artists/slug/${slugOf('draft')}?withReleases=true`);
    expect({ plain: plain.status(), full: full.status() }).toEqual({ plain: 404, full: 404 });

    await page.goto(`/artists/${slugOf('draft')}`);

    await expect(page.getByText("That page doesn't exist")).toBeVisible({ timeout: 15_000 });
    // Next may inject the tag more than once while streaming; one is enough.
    await expect(page.locator('meta[name="robots"][content*="noindex"]').first()).toBeAttached();
    await expect(page.getByText(`E2E API draft ${STAMP}`)).toHaveCount(0);
  });

  // #745: own releases first, then featured appearances, then band releases.
  test('list own releases, then guest credits, then band releases', async ({ request }) => {
    const response = await request.get(`/api/artists/slug/${slugOf('lead')}?withReleases=true`);
    const { releases } = (await response.json()) as { releases: Array<{ credit: string }> };

    expect(releases.map(({ credit }) => credit)).toEqual(['primary', 'featured', 'member']);
  });

  // #746, ADR-0007: an artist is listed once it has a published release.
  test('leave a published artist with no release out of the listing', async ({ request, page }) => {
    const response = await request.get(
      `/api/artists?listing=published&search=${encodeURIComponent(UNLISTED_NAME)}`
    );
    const { rows } = (await response.json()) as { rows: Array<{ id: string }> };
    expect(rows).toEqual([]);

    await page.goto('/artists');
    await expect(page.locator('[data-slot="card"]').first()).toBeVisible({ timeout: 15_000 });
    // The search is a combobox: open it, then type into its input.
    await page.getByRole('button', { name: 'Search artists' }).click();
    await page.getByPlaceholder('Search by name, genre, or release').fill(UNLISTED_NAME);
    await expect(page.getByText(`No artists match “${UNLISTED_NAME}”.`).first()).toBeVisible({
      timeout: 15_000,
    });
  });

  // #755: an index card shows active years, never a birth year.
  test('show no birth year on an index card', async ({ page }) => {
    await page.goto('/artists');
    await expect(page.locator('[data-slot="card"]').first()).toBeVisible({ timeout: 15_000 });
    await page.getByRole('button', { name: 'Search artists' }).click();
    await page.getByPlaceholder('Search by name, genre, or release').fill(BORN_NAME);

    const card = page.locator('[data-slot="card"]').filter({ hasText: BORN_NAME });
    await expect(card).toHaveCount(1, { timeout: 15_000 });
    await expect(card).not.toContainText(/\bb\. \d{4}/);
  });
});
