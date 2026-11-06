/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { randomUUID } from 'node:crypto';

import { prisma } from '@/lib/prisma';
import type { ServiceResponse } from '@/lib/services/service.types';
import { MAX_IMAGES_PER_TOUR } from '@/lib/validation/tours/image-schema';

import { tourDateImageRecords, tourImageRecords } from './tour-image-records';
import { TourImages } from './tour-images';

import type { TourImagePut, TourImageStore } from './types';

// Contract: on a real MongoDB, through the real TourImage adapter, a tour
// never holds more images than its cap. The cap is counted when a presigned
// URL is issued, before any object exists, so two URLs issued while the tour
// sits one under its cap must not both become images. Runs only under
// `pnpm run test:db`.

const prefix = `__contract:${randomUUID()}:`;

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

let tourId = '';
const outcome: {
  requests: Array<ServiceResponse<{ s3Key: string }>>;
  confirms: Array<ServiceResponse<unknown>>;
  stored: number;
} = { requests: [], confirms: [], stored: 0 };

// Every row is seeded, and every write is run, here: the tests run shuffled
// and only read.
beforeAll(async () => {
  ({ id: tourId } = await prisma.tour.create({
    data: { title: `${prefix}tour` },
    select: { id: true },
  }));

  // One under the cap, created one at a time (fresh-collection read-back race).
  for (let index = 0; index < MAX_IMAGES_PER_TOUR - 1; index++) {
    await tourImageRecords.create({
      ownerId: tourId,
      s3Key: `${prefix}seed-${index}.jpg`,
      s3Url: `https://cdn.example.com/${prefix}seed-${index}.jpg`,
      s3Bucket: 'bucket',
      fileName: `seed-${index}.jpg`,
      fileSize: 10,
      mimeType: 'image/jpeg',
      displayOrder: index,
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
          '507f1f77bcf86cd799439011'
        )
      );
    }
  }

  outcome.stored = await prisma.tourImage.count({ where: { tourId } });
});

afterAll(async () => {
  await prisma.tourImage.deleteMany({ where: { tourId } });
  await prisma.tour.deleteMany({ where: { title: { startsWith: prefix } } });
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
    expect(deleted).toEqual([signed[1]?.s3Key]);
  });
});
