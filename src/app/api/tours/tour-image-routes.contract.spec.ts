// @vitest-environment node
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { randomUUID } from 'node:crypto';

import { NextRequest } from 'next/server';

import { prisma } from '@/lib/prisma';

import { GET as getTourDateImages } from './[tourId]/dates/[tourDateId]/images/route';
import { GET as getTourImages } from './[tourId]/images/route';
import { GET as getTour } from './[tourId]/route';

// Contract: on a real MongoDB, through the real routes, services and
// repositories, an anonymous visitor cannot read the images of a Tour, or of
// a tour date, the public may not see (ADR-0015). The fixture is a tour whose
// only date names only an unpublished artist: the public tour route answers
// 404 for it, so its images must not be served either. Only the session (an
// anonymous visitor) and the rate limiter are stubbed. Runs only under
// `pnpm run test:db`.

vi.mock('@/auth', () => ({ auth: vi.fn(async () => null) }));
vi.mock('@/lib/decorators/with-rate-limit', () => ({
  withRateLimit:
    () =>
    (handler: (...args: unknown[]) => unknown) =>
    (...args: unknown[]) =>
      handler(...args),
}));

const prefix = `__contract:${randomUUID()}:`;
const BASE = 'http://localhost:3000/api/tours';

const ids = { tour: '', tourDate: '', venue: '', artist: '' };
/** What a route answered: its status and whether its body names a seeded image. */
interface Served {
  status: number;
  leaksImage: boolean;
}

const responses: Record<'tour' | 'tourImages' | 'tourDateImages', Served | null> = {
  tour: null,
  tourImages: null,
  tourDateImages: null,
};

// `json()` rather than `text()`: the unit setup stubs `NextResponse.json` with
// a plain object that carries only `json`, `status` and `headers`.
const served = async (response: Response): Promise<Served> => ({
  status: response.status,
  leaksImage: JSON.stringify(await response.json()).includes(prefix),
});

/** One image row's fields; the owner field is added per model. */
const imageFields = (name: string) => ({
  s3Key: `${prefix}${name}.jpg`,
  s3Url: `https://cdn.example.com/${prefix}${name}.jpg`,
  s3Bucket: 'bucket',
  fileName: `${name}.jpg`,
  fileSize: 10,
  mimeType: 'image/jpeg',
  displayOrder: 0,
});

// Every row is seeded, and every request is made, here: the tests run
// shuffled and only read. Rows are created one at a time (fresh-collection
// read-back race).
beforeAll(async () => {
  ({ id: ids.artist } = await prisma.artist.create({
    data: { firstName: 'Contract', surname: 'Hidden', slug: `${prefix}hidden-artist` },
    select: { id: true },
  }));
  ({ id: ids.venue } = await prisma.venue.create({
    data: { name: `${prefix}venue`, city: 'Contract City' },
    select: { id: true },
  }));
  ({ id: ids.tour } = await prisma.tour.create({
    data: { title: `${prefix}hidden tour` },
    select: { id: true },
  }));
  ({ id: ids.tourDate } = await prisma.tourDate.create({
    data: {
      tourId: ids.tour,
      venueId: ids.venue,
      startDate: new Date('2027-01-01T20:00:00.000Z'),
      showStartTime: new Date('2027-01-01T20:00:00.000Z'),
    },
    select: { id: true },
  }));
  await prisma.tourDateHeadliner.create({
    data: { tourDateId: ids.tourDate, artistId: ids.artist },
  });
  await prisma.tourImage.create({ data: { tourId: ids.tour, ...imageFields('tour-image') } });
  await prisma.tourDateImage.create({
    data: { tourDateId: ids.tourDate, ...imageFields('tour-date-image') },
  });

  const tourParams = { params: Promise.resolve({ tourId: ids.tour }) };
  responses.tour = await served(await getTour(new NextRequest(`${BASE}/${ids.tour}`), tourParams));
  responses.tourImages = await served(
    await getTourImages(new NextRequest(`${BASE}/${ids.tour}/images`), tourParams)
  );
  responses.tourDateImages = await served(
    await getTourDateImages(new NextRequest(`${BASE}/${ids.tour}/dates/${ids.tourDate}/images`), {
      params: Promise.resolve({ tourId: ids.tour, tourDateId: ids.tourDate }),
    })
  );
});

afterAll(async () => {
  await prisma.tourDateImage.deleteMany({ where: { s3Key: { startsWith: prefix } } });
  await prisma.tourImage.deleteMany({ where: { s3Key: { startsWith: prefix } } });
  await prisma.tourDateHeadliner.deleteMany({ where: { artistId: ids.artist } });
  await prisma.tourDate.deleteMany({ where: { tourId: ids.tour } });
  await prisma.tour.deleteMany({ where: { title: { startsWith: prefix } } });
  await prisma.venue.deleteMany({ where: { name: { startsWith: prefix } } });
  await prisma.artist.deleteMany({ where: { slug: { startsWith: prefix } } });
});

describe('tour image routes on MongoDB, for an anonymous visitor', () => {
  it('reads the tour itself as not found, since its only date is hidden', async () => {
    expect(responses.tour).toEqual({ status: 404, leaksImage: false });
  });

  it("refuses the hidden tour's images", async () => {
    expect(responses.tourImages).toEqual({ status: 401, leaksImage: false });
  });

  it("refuses the hidden tour date's images", async () => {
    expect(responses.tourDateImages).toEqual({ status: 401, leaksImage: false });
  });
});
