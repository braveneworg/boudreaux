/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { randomUUID } from 'node:crypto';

import { PrismaClient } from '@prisma/client';

import { expect, test } from '../../fixtures/base.fixture';

/**
 * The public artist reads, as an anonymous visitor makes them. These were
 * manual smokes after #746, #755, #785, #792 and #796; each test below is one
 * of them. The artist page is the one public read of an artist's page model,
 * so the privacy checks read its body, RSC payload included.
 *
 * The spec seeds its own rows, stamped per worker, so it changes no seeded
 * count another spec reads: an artist carrying every private field, a bio and
 * a chosen display image whose pool internals are sentinels, a band it
 * belongs to, an artist it is a guest of, a draft, and a published artist
 * with no release. All are dated in 2000 so they never lead a newest-first
 * listing.
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
const nameOf = (label: string): string => `ZZ E2E API ${label} ${STAMP}`;
const UNLISTED_NAME = `ZZ E2E Unlisted ${STAMP}`;
const BORN_NAME = `ZZ E2E Born ${STAMP}`;

/** The lead's bio texts, shown only on the lead's own page. */
const LEAD_BIO = 'E2E lead bio.';
const LEAD_SHORT_BIO = 'E2E lead short bio.';

/** The lead's private values, seeded below; no public page may carry one. */
const PRIVATE_VALUES = [
  'lead@example.com',
  '555-0100',
  '1 Private Street',
  'internal note',
  'e2e-job-token',
  'e2e-admin',
];

/** The lead's chosen display image: what the page shows, and pool internals it never may. */
const DISPLAY_IMAGE_URL = `https://picsum.photos/seed/e2e-api-${STAMP}/600/400`;
const POOL_SENTINELS = {
  originalUrl: `https://e2e-original-${STAMP}.example/source.jpg`,
  contentHash: `e2e-content-hash-${STAMP}`,
  perceptualHash: `e2e-perceptual-hash-${STAMP}`,
  faceScore: 61.2345,
};
/** The bio-image fields that are the pool's alone. */
const POOL_KEYS = ['faceScore', 'hasFace', 'contentHash', 'perceptualHash', 'originalUrl'];

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
      displayName: nameOf(label),
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
    bio: `<p>${LEAD_BIO}</p>`,
    shortBio: LEAD_SHORT_BIO,
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
  await prisma.artistBioImage.create({
    data: {
      artistId: leadId,
      url: DISPLAY_IMAGE_URL,
      alt: `E2E lead on stage ${STAMP}`,
      isPrimary: false,
      origin: 'custom',
      displayOrder: 0,
      hasFace: true,
      ...POOL_SENTINELS,
    },
  });

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
    await prisma.artistBioImage.deleteMany({ where: { artistId: { in: artistIds } } });
    await prisma.artistMember.deleteMany({ where: { memberId: { in: artistIds } } });
    await prisma.artist.deleteMany({ where: { id: { in: artistIds } } });
  }
  await prisma.$disconnect();
});

test.describe('Public artist reads', () => {
  // #785: the page renders from the artist page model, which is parsed
  // through its schema as a guard, so no private value reaches its body.
  test('carry no private value on the artist page', async ({ request }) => {
    const response = await request.get(`/artists/${slugOf('lead')}`);
    const body = await response.text();
    // The lead's own page, not the not-found shell.
    expect(body).toContain(nameOf('lead'));

    expect(PRIVATE_VALUES.filter((value) => body.includes(value))).toEqual([]);
  });

  // The collage gets each display image with only what it renders: none of
  // the pool's internals reaches the page's HTML or its RSC payload.
  test('carry a display image without its pool internals', async ({ request }) => {
    const body = await (await request.get(`/artists/${slugOf('lead')}`)).text();
    expect(body).toContain(DISPLAY_IMAGE_URL);

    const leaked = [...Object.values(POOL_SENTINELS).map(String), ...POOL_KEYS].filter((value) =>
      body.includes(value)
    );
    expect(leaked).toEqual([]);
  });

  test('keep the by-id read for admins', async ({ request }) => {
    const response = await request.get(`/api/artists/${leadId}`);

    expect(response.status()).toBe(401);
  });

  // #796: a bio is shown only on its artist's own page — never on the page
  // of the band it belongs to, or of the artist it is a guest of.
  test('show no bio on the page of a band or a host', async ({ request }) => {
    const pages = await Promise.all(
      ['band', 'host'].map(async (label) => ({
        label,
        body: await (await request.get(`/artists/${slugOf(label)}`)).text(),
      }))
    );
    // Each page is the artist's own, not the not-found shell.
    expect(
      pages.filter(({ label, body }) => !body.includes(nameOf(label))).map(({ label }) => label)
    ).toEqual([]);

    const leaks = pages.flatMap(({ label, body }) =>
      [LEAD_BIO, LEAD_SHORT_BIO]
        .filter((text) => body.includes(text))
        .map((text) => `${label}: ${text}`)
    );
    expect(leaks).toEqual([]);
  });

  // #792: a draft artist exists for nobody but the admin. The page streams
  // the root loading shell before it looks the artist up, so its not-found
  // answer is a soft 404 (status 200, `noindex`), as Next documents for a
  // notFound() after streaming starts.
  test('show the page of a draft artist as not found', async ({ page }) => {
    await page.goto(`/artists/${slugOf('draft')}`);

    await expect(page.getByText("That page doesn't exist")).toBeVisible({ timeout: 15_000 });
    // Next may inject the tag more than once while streaming; one is enough.
    await expect(page.locator('meta[name="robots"][content*="noindex"]').first()).toBeAttached();
    await expect(page.getByText(`E2E API draft ${STAMP}`)).toHaveCount(0);
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
