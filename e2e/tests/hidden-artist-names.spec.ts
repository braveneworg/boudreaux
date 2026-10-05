/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { PrismaClient } from '@prisma/client';

import { expect, test } from '../fixtures/auth.fixture';

/**
 * E2E coverage for ADR-0015: a hidden artist's name appears on no public
 * surface.
 *
 * One hidden artist, named with a marker no real row contains, is credited,
 * featured, booked and listed as a band member next to a public artist. Every
 * public route and page is then read anonymously: the marker must be absent
 * and the public artist's name present, which proves the hidden artist was
 * filtered out rather than the whole record dropped.
 *
 * The spec seeds and removes its own rows in the isolated E2E database. It
 * reads releases and artists by search or by id, never through the cached
 * default listing page, so a cached page cannot hide the seeded rows.
 *
 * Parallel safety: every test reads the rows one `beforeAll` seeded, so the
 * file runs in a single worker (`mode: 'default'`). Every row carries this
 * worker's `STAMP`, and the cleanup removes rows with that stamp only, so a
 * retry or another spec never deletes rows this run is still reading.
 */

const E2E_DATABASE_URL =
  process.env.E2E_DATABASE_URL || 'mongodb://localhost:27018/boudreaux-e2e?replicaSet=rs0';

const prisma = new PrismaClient({ datasourceUrl: E2E_DATABASE_URL });

// Unique per worker process: a module is loaded once in each worker.
const STAMP = `${Date.now()}${Math.floor(Math.random() * 1e6)}`;
const SLUG_PREFIX = 'e2e-hidden-names';
const HIDDEN_NAME = `ZZHIDDENNAME${STAMP}`;
const PUBLIC_NAME = `ZZPUBLICNAME${STAMP}`;
const BAND_NAME = `ZZPUBLICBAND${STAMP}`;
const RELEASE_TITLE = `E2E Hidden Names Album ${STAMP}`;
const SOLO_RELEASE_TITLE = `E2E Hidden Names Solo ${STAMP}`;
const TOUR_TITLE = `E2E Hidden Names Tour ${STAMP}`;
const HIDDEN_TOUR_TITLE = `E2E Hidden Names Hidden Tour ${STAMP}`;
const VENUE_NAME = `E2E Hidden Names Venue ${STAMP}`;
const FEATURED_NAME = `E2E Hidden Names Featured ${STAMP}`;
/**
 * Long before the seeded featured row. The home page player leads with the
 * newest `featuredOn`, and this row has no cover art and no release, so a
 * recent date here takes the lead from the seeded row and leaves the home page
 * without a playable cover for as long as this file runs.
 */
const FEATURED_ON = new Date('2020-01-01T00:00:00.000Z');

interface Seeded {
  hiddenId: string;
  publicId: string;
  publicSlug: string;
  bandSlug: string;
  releaseId: string;
  soloReleaseId: string;
  tourId: string;
  hiddenTourId: string;
  featuredId: string;
}

let seeded: Seeded;

const seed = async (): Promise<Seeded> => {
  const now = new Date();
  const artist = (slug: string, displayName: string, publishedOn?: Date) =>
    prisma.artist.create({
      data: {
        firstName: displayName,
        surname: 'E2E',
        displayName,
        slug: `${SLUG_PREFIX}-${slug}-${STAMP}`,
        ...(publishedOn ? { publishedOn } : {}),
      },
    });
  // The hidden artist has never been published: every other condition holds.
  const hidden = await artist('hidden', HIDDEN_NAME);
  const visible = await artist('public', PUBLIC_NAME, now);
  const band = await artist('band', BAND_NAME, now);
  await prisma.artistMember.createMany({
    data: [
      { artistId: band.id, memberId: hidden.id },
      { artistId: band.id, memberId: visible.id },
    ],
  });

  const release = (title: string) =>
    prisma.release.create({
      data: {
        title,
        releasedOn: new Date('2024-01-15T00:00:00.000Z'),
        coverArt: 'https://example.com/e2e-hidden-names.jpg',
        formats: ['DIGITAL'],
        publishedAt: now,
      },
    });
  // The hidden artist is the album artist (first credit) of the shared release.
  const shared = await release(RELEASE_TITLE);
  await prisma.artistRelease.create({ data: { artistId: hidden.id, releaseId: shared.id } });
  await prisma.artistRelease.create({ data: { artistId: visible.id, releaseId: shared.id } });
  await prisma.artistRelease.create({ data: { artistId: band.id, releaseId: shared.id } });
  const solo = await release(SOLO_RELEASE_TITLE);
  await prisma.artistRelease.create({ data: { artistId: hidden.id, releaseId: solo.id } });

  const venue = await prisma.venue.create({ data: { name: VENUE_NAME, city: 'Probe' } });
  const date = (tourId: string, day: number) =>
    prisma.tourDate.create({
      data: {
        tourId,
        venueId: venue.id,
        startDate: new Date(Date.UTC(2030, 5, day)),
        showStartTime: new Date(Date.UTC(2030, 5, day, 20)),
      },
    });
  const tour = await prisma.tour.create({ data: { title: TOUR_TITLE } });
  const sharedDate = await date(tour.id, 1);
  const hiddenOnlyDate = await date(tour.id, 2);
  const hiddenTour = await prisma.tour.create({ data: { title: HIDDEN_TOUR_TITLE } });
  const hiddenTourDate = await date(hiddenTour.id, 3);
  await prisma.tourDateHeadliner.createMany({
    data: [
      { tourDateId: sharedDate.id, artistId: hidden.id, sortOrder: 0 },
      { tourDateId: sharedDate.id, artistId: visible.id, sortOrder: 1 },
      { tourDateId: hiddenOnlyDate.id, artistId: hidden.id, sortOrder: 0 },
      { tourDateId: hiddenTourDate.id, artistId: hidden.id, sortOrder: 0 },
    ],
  });

  const featured = await prisma.featuredArtist.create({
    data: {
      displayName: FEATURED_NAME,
      publishedOn: now,
      featuredOn: FEATURED_ON,
      artists: { connect: [{ id: hidden.id }, { id: visible.id }] },
    },
  });

  return {
    hiddenId: hidden.id,
    publicId: visible.id,
    publicSlug: visible.slug,
    bandSlug: band.slug,
    releaseId: shared.id,
    soloReleaseId: solo.id,
    tourId: tour.id,
    hiddenTourId: hiddenTour.id,
    featuredId: featured.id,
  };
};

/** Removes the rows of THIS run only: everything that carries its stamp. */
const cleanup = async (): Promise<void> => {
  const stamped = { endsWith: String(STAMP) };
  const artists = await prisma.artist.findMany({
    where: { slug: { startsWith: SLUG_PREFIX, ...stamped } },
    select: { id: true },
  });
  const artistIds = artists.map(({ id }) => id);
  const tours = await prisma.tour.findMany({
    where: { title: stamped },
    select: { id: true },
  });
  const tourIds = tours.map(({ id }) => id);

  await prisma.tourDateHeadliner.deleteMany({ where: { tourDate: { tourId: { in: tourIds } } } });
  await prisma.tourDate.deleteMany({ where: { tourId: { in: tourIds } } });
  await prisma.tour.deleteMany({ where: { id: { in: tourIds } } });
  await prisma.venue.deleteMany({ where: { name: stamped } });
  await prisma.featuredArtist.deleteMany({ where: { displayName: stamped } });
  await prisma.artistMember.deleteMany({
    where: { OR: [{ artistId: { in: artistIds } }, { memberId: { in: artistIds } }] },
  });
  await prisma.artistRelease.deleteMany({ where: { artistId: { in: artistIds } } });
  await prisma.release.deleteMany({ where: { title: stamped } });
  await prisma.artist.deleteMany({ where: { id: { in: artistIds } } });
};

test.describe('A hidden artist’s name is never public (ADR-0015)', () => {
  // One worker for the whole file: the tests share the rows `beforeAll` seeds.
  test.describe.configure({ mode: 'default' });

  test.beforeAll(async () => {
    seeded = await seed();
  });

  test.afterAll(async () => {
    await cleanup();
    await prisma.$disconnect();
  });

  /** Public reads that must name the public artist and never the hidden one. */
  const namingReads = (): Array<{ name: string; url: string }> => [
    {
      name: 'release search by title',
      url: `/api/releases?listing=published&search=${encodeURIComponent(RELEASE_TITLE)}`,
    },
    { name: 'release detail API', url: `/api/releases/${seeded.releaseId}?withTracks=true` },
    { name: 'release page', url: `/releases/${seeded.releaseId}` },
    {
      name: 'artist page API',
      url: `/api/artists/slug/${seeded.publicSlug}?withReleases=true`,
    },
    { name: 'artist page', url: `/artists/${seeded.publicSlug}` },
    { name: 'featured listing', url: '/api/featured-artists?active=true&limit=100' },
    {
      name: 'tour search by title',
      url: `/api/tours?search=${encodeURIComponent(TOUR_TITLE)}`,
    },
    { name: 'tour detail API', url: `/api/tours/${seeded.tourId}` },
    { name: 'tour page', url: `/tours/${seeded.tourId}` },
  ];

  test('names the public artist and never the hidden one', async ({ page }) => {
    for (const { name, url } of namingReads()) {
      const response = await page.request.get(url);
      const body = await response.text();

      expect(response.status(), `${name} status`).toBe(200);
      expect(body, `${name} names the public artist`).toContain(PUBLIC_NAME);
      expect(body, `${name} hides the hidden artist`).not.toContain(HIDDEN_NAME);
    }
  });

  test('lists a band without its hidden member', async ({ page }) => {
    const response = await page.request.get(
      `/api/artists?listing=published&search=${encodeURIComponent(BAND_NAME)}`
    );
    const body = await response.text();

    expect(response.status()).toBe(200);
    expect(body).toContain(BAND_NAME);
    expect(body).toContain(PUBLIC_NAME);
    expect(body).not.toContain(HIDDEN_NAME);
  });

  test('finds nothing when the public searches for the hidden name', async ({ page }) => {
    const searches = [
      `/api/releases?listing=published&search=${HIDDEN_NAME}`,
      `/api/artists?listing=published&search=${HIDDEN_NAME}`,
      `/api/artists/search?q=${HIDDEN_NAME}`,
      `/api/tours?search=${HIDDEN_NAME}`,
    ];

    for (const url of searches) {
      const response = await page.request.get(url);
      const body = await response.text();

      expect(response.status(), url).toBe(200);
      expect(body, `${url} returns no seeded row`).not.toContain(String(STAMP));
    }
  });

  test('keeps a release credited only to a hidden artist public, with no byline', async ({
    page,
  }) => {
    const response = await page.request.get(
      `/api/releases/${seeded.soloReleaseId}?withTracks=true`
    );
    const body = await response.text();

    expect(response.status()).toBe(200);
    expect(body).toContain(SOLO_RELEASE_TITLE);
    expect(body).not.toContain(HIDDEN_NAME);
  });

  // #813: the album artist is the first credit in stored order. When it is
  // hidden the byline stays empty; the next, public credit is not promoted.
  test('leaves the byline empty when the first credit is hidden, though a later one is public', async ({
    page,
  }) => {
    const listing = await page.request.get(
      `/api/releases?listing=published&search=${encodeURIComponent(RELEASE_TITLE)}`
    );
    const detail = await page.request.get(`/api/releases/${seeded.releaseId}?withTracks=true`);
    const { rows } = (await listing.json()) as {
      rows: Array<{ id: string; albumArtist: unknown }>;
    };
    const { albumArtist } = (await detail.json()) as { albumArtist: unknown };

    expect({
      listing: rows.find(({ id }) => id === seeded.releaseId)?.albumArtist ?? null,
      detail: albumArtist ?? null,
    }).toEqual({ listing: null, detail: null });
  });

  test('drops a tour date whose headliners are all hidden', async ({ page }) => {
    const response = await page.request.get(`/api/tours/${seeded.tourId}`);
    const { tour } = (await response.json()) as { tour: { tourDates: unknown[] } };

    expect(tour.tourDates).toHaveLength(1);
  });

  test('returns 404 for a tour whose dates are all hidden', async ({ page }) => {
    const api = await page.request.get(`/api/tours/${seeded.hiddenTourId}`);
    const listing = await page.request.get(
      `/api/tours?search=${encodeURIComponent(HIDDEN_TOUR_TITLE)}`
    );

    expect(api.status()).toBe(404);
    expect(await listing.text()).not.toContain(HIDDEN_TOUR_TITLE);
  });

  test('does not list another artist’s releases for a hidden artist’s id', async ({ page }) => {
    const response = await page.request.get(
      `/api/releases/${seeded.soloReleaseId}/related?artistId=${seeded.hiddenId}`
    );

    expect(await response.json()).toEqual({ releases: [] });
  });

  test('refuses the admin reads to an anonymous visitor', async ({ page }) => {
    const adminReads = [
      `/api/featured-artists/${seeded.featuredId}`,
      `/api/tours/${seeded.tourId}?scope=admin`,
      `/api/tours/${seeded.tourId}/dates`,
      `/api/releases/${seeded.releaseId}/credits`,
      `/api/artists/${seeded.hiddenId}/published-work`,
    ];

    for (const url of adminReads) {
      const response = await page.request.get(url);
      const body = await response.text();

      expect(response.status(), url).toBe(401);
      expect(body, url).not.toContain(HIDDEN_NAME);
    }
  });

  test('still shows an admin every headliner on the tour edit screen', async ({ adminPage }) => {
    const response = await adminPage.request.get(`/api/tours/${seeded.tourId}/dates`);
    const body = await response.text();

    expect(response.status()).toBe(200);
    expect(body).toContain(HIDDEN_NAME);
  });
});
