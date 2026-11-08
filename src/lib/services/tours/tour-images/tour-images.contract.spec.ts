/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { randomUUID } from 'node:crypto';

import { prisma } from '@/lib/prisma';
import type { ServiceResponse } from '@/lib/services/service.types';
import { MAX_IMAGES_PER_TOUR, MAX_IMAGES_PER_TOUR_DATE } from '@/lib/validation/tours/image-schema';

import { tourDateImageRecords, tourImageRecords } from './tour-image-records';
import { TourImages } from './tour-images';

import type { TourImageOwnerKind, TourImagePut, TourImageStore } from './types';

// Contract: on a real MongoDB, through the real image adapters, an owner
// never holds more images than its cap. The cap is counted when a presigned
// URL is issued, before any object exists, so two URLs issued while the
// owner sits one under its cap must not both become images — whether the two
// confirms arrive one after the other or at the same instant (two admins, or
// two tabs). Runs only under `pnpm run test:db`.

const prefix = `__contract:${randomUUID()}:`;
const ADMIN_ID = '507f1f77bcf86cd799439011';

const signed: TourImagePut[] = [];
const deleted: string[] = [];

/** The S3 store, faked: signing and deleting are recorded, nothing is sent. */
const store: TourImageStore = {
  presignPut: async (put) => {
    signed.push(put);
    return {
      success: true,
      data: { uploadUrl: 'https://signed', s3Key: put.s3Key, s3Bucket: 'bucket', expiresIn: 900 },
    };
  },
  delete: async (s3Key) => {
    deleted.push(s3Key);
    return true;
  },
  publicUrl: (s3Key) => `https://cdn.example.com/${s3Key}`,
};

const images = new TourImages({
  store,
  records: { tour: tourImageRecords, tourDate: tourDateImageRecords },
});

const FILE = { fileName: 'photo.jpg', fileSize: 1024, mimeType: 'image/jpeg' as const };

/** One seeded image row's fields; the owner field is added per model. */
const imageRow = (owner: string, index: number) => ({
  s3Key: `${prefix}${owner}-seed-${index}.jpg`,
  s3Url: `https://cdn.example.com/${prefix}${owner}-seed-${index}.jpg`,
  s3Bucket: 'bucket',
  fileName: `seed-${index}.jpg`,
  fileSize: 10,
  mimeType: 'image/jpeg',
  displayOrder: index,
});

let tourId = '';
let venueId = '';
const racing = { tour: '', tourDate: '' };
let missingOwner: ServiceResponse<unknown> | null = null;

const outcome: {
  requests: Array<ServiceResponse<{ s3Key: string }>>;
  confirms: Array<ServiceResponse<unknown>>;
  stored: number;
} = { requests: [], confirms: [], stored: 0 };

/** How many admins confirm at once in a race. More than two makes the old
 * count-then-insert interleave on every run, not only on some. */
const RACERS = 5;

/** Confirms raced on one owner: what each answered, and what was stored. */
interface Race {
  confirms: string[];
  displayOrders: number[];
  stored: number;
}
const races = {
  tour: { confirms: [], displayOrders: [], stored: 0 } as Race,
  tourDate: { confirms: [], displayOrders: [], stored: 0 } as Race,
};

/** {@link RACERS} admins confirm at the same instant while the owner sits one under its cap. */
const race = async (kind: TourImageOwnerKind, id: string, keyEntity: string): Promise<Race> => {
  const confirms = await Promise.all(
    Array.from({ length: RACERS }, (_, n) =>
      images.confirmUpload(
        { kind, id },
        { ...FILE, s3Key: `media/${keyEntity}/${id}/race-${n}-1-abc.jpg`, s3Bucket: 'bucket' },
        ADMIN_ID
      )
    )
  );
  const rows =
    kind === 'tour'
      ? await prisma.tourImage.findMany({ where: { tourId: id } })
      : await prisma.tourDateImage.findMany({ where: { tourDateId: id } });
  return {
    confirms: confirms.map((confirm) => (confirm.success ? 'stored' : confirm.code)).sort(),
    displayOrders: rows.map(({ displayOrder }) => displayOrder).sort((a, b) => a - b),
    stored: rows.length,
  };
};

// Every row is seeded, and every write is run, here: the tests run shuffled
// and only read. Rows are created one at a time (fresh-collection read-back
// race).
beforeAll(async () => {
  ({ id: tourId } = await prisma.tour.create({
    data: { title: `${prefix}tour` },
    select: { id: true },
  }));
  ({ id: racing.tour } = await prisma.tour.create({
    data: { title: `${prefix}racing tour` },
    select: { id: true },
  }));
  ({ id: venueId } = await prisma.venue.create({
    data: { name: `${prefix}venue`, city: 'Contract City' },
    select: { id: true },
  }));
  ({ id: racing.tourDate } = await prisma.tourDate.create({
    data: {
      tourId: racing.tour,
      venueId,
      startDate: new Date('2027-01-01T20:00:00.000Z'),
      showStartTime: new Date('2027-01-01T20:00:00.000Z'),
    },
    select: { id: true },
  }));

  for (const owner of [tourId, racing.tour]) {
    for (let index = 0; index < MAX_IMAGES_PER_TOUR - 1; index++) {
      await prisma.tourImage.create({ data: { tourId: owner, ...imageRow(owner, index) } });
    }
  }
  for (let index = 0; index < MAX_IMAGES_PER_TOUR_DATE - 1; index++) {
    await prisma.tourDateImage.create({
      data: { tourDateId: racing.tourDate, ...imageRow(racing.tourDate, index) },
    });
  }

  const owner = { kind: 'tour' as const, id: tourId };

  // Two tabs each ask for an upload while the tour sits one under its cap…
  outcome.requests.push(await images.requestUpload(owner, FILE));
  outcome.requests.push(await images.requestUpload(owner, FILE));

  // …and each confirms the object it put.
  for (const request of outcome.requests) {
    if (request.success) {
      outcome.confirms.push(
        await images.confirmUpload(
          owner,
          { ...FILE, s3Key: request.data.s3Key, s3Bucket: 'bucket' },
          ADMIN_ID
        )
      );
    }
  }

  outcome.stored = await prisma.tourImage.count({ where: { tourId } });

  races.tour = await race('tour', racing.tour, 'tours');
  races.tourDate = await race('tourDate', racing.tourDate, 'tour-dates');

  // A confirm for a tour that does not exist stores no orphaned image.
  const absent = '507f1f77bcf86cd799439099';
  missingOwner = await images.confirmUpload(
    { kind: 'tour', id: absent },
    { ...FILE, s3Key: `media/tours/${absent}/photo-1-abc.jpg`, s3Bucket: 'bucket' },
    ADMIN_ID
  );
});

afterAll(async () => {
  await prisma.tourDateImage.deleteMany({ where: { tourDateId: racing.tourDate } });
  await prisma.tourImage.deleteMany({ where: { tourId: { in: [tourId, racing.tour] } } });
  await prisma.tourDate.deleteMany({ where: { tourId: racing.tour } });
  await prisma.tour.deleteMany({ where: { title: { startsWith: prefix } } });
  await prisma.venue.deleteMany({ where: { name: { startsWith: prefix } } });
});

describe('tour image cap on MongoDB', () => {
  it('issues both upload URLs while the tour is one under its cap', () => {
    expect(outcome.requests.map(({ success }) => success)).toEqual([true, true]);
  });

  it('never stores more images than the cap', () => {
    expect(outcome.stored).toBe(MAX_IMAGES_PER_TOUR);
  });

  it('refuses the confirm that would pass the cap', () => {
    expect(outcome.confirms.map((confirm) => (confirm.success ? 'stored' : confirm.code))).toEqual([
      'stored',
      'LIMIT_EXCEEDED',
    ]);
  });

  it('deletes the object a refused confirm leaves in the bucket', () => {
    expect(deleted.filter((s3Key) => s3Key.startsWith(`media/tours/${tourId}/`))).toEqual([
      signed[1]?.s3Key,
    ]);
  });

  it('refuses a confirm for a tour that does not exist, storing nothing', async () => {
    expect({
      code: missingOwner?.success === false ? missingOwner.code : 'stored',
      stored: await prisma.tourImage.count({ where: { tourId: '507f1f77bcf86cd799439099' } }),
    }).toEqual({ code: 'NOT_FOUND', stored: 0 });
  });

  describe.each([
    { kind: 'tour', max: MAX_IMAGES_PER_TOUR, outcome: () => races.tour },
    { kind: 'tourDate', max: MAX_IMAGES_PER_TOUR_DATE, outcome: () => races.tourDate },
  ])('when confirms race on a $kind one under its cap', ({ max, outcome: raced }) => {
    it('stores exactly one, refuses the others, and keeps the order unique', () => {
      expect(raced()).toEqual({
        confirms: [...Array.from({ length: RACERS - 1 }, () => 'LIMIT_EXCEEDED'), 'stored'],
        displayOrders: Array.from({ length: max }, (_, index) => index),
        stored: max,
      });
    });
  });
});
