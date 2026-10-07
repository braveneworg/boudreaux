/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { randomUUID } from 'node:crypto';

import { prisma } from '@/lib/prisma';

import { bioImageWhere } from './bio-media-where';

// Contract: `bioImageWhere.displayCandidate` matches exactly the rows the
// display-image resolution can pick from — a human's chosen row (any numeric
// `displayOrder`) or the job's suggested row (`isPrimary`) — for every way
// `displayOrder` can be stored. Runs only under `pnpm run test:db`.

type OrderStorage = 'absent' | 'null' | 'zero' | 'two';
const ORDERS: OrderStorage[] = ['absent', 'null', 'zero', 'two'];
const PRIMARIES = [true, false] as const;

const orderFor = (storage: OrderStorage): number | null | undefined =>
  storage === 'absent' ? undefined : storage === 'null' ? null : storage === 'zero' ? 0 : 2;

const prefix = `__contract:${randomUUID()}:`;
let artistId = '';

const urlOf = (order: OrderStorage, primary: boolean): string =>
  `${prefix}order=${order}:primary=${primary}`;

const expectUrls = (predicate: (order: OrderStorage, primary: boolean) => boolean): string[] =>
  ORDERS.flatMap((order) =>
    PRIMARIES.filter((primary) => predicate(order, primary)).map((primary) => urlOf(order, primary))
  ).sort();

beforeAll(async () => {
  const artist = await prisma.artist.create({
    data: { firstName: prefix, surname: 'contract', slug: `${prefix}slug` },
    select: { id: true },
  });
  artistId = artist.id;
  // Serial creates so an omitted `displayOrder` is genuinely absent.
  for (const order of ORDERS) {
    for (const isPrimary of PRIMARIES) {
      const displayOrder = orderFor(order);
      await prisma.artistBioImage.create({
        data: {
          artistId,
          url: urlOf(order, isPrimary),
          isPrimary,
          ...(displayOrder !== undefined && { displayOrder }),
        },
      });
    }
  }
});

afterAll(async () => {
  await prisma.artistBioImage.deleteMany({ where: { artistId } });
  await prisma.artist.deleteMany({ where: { id: artistId } });
  await prisma.$disconnect();
});

describe('bioImageWhere.chosen (Docker Mongo contract)', () => {
  it('matches exactly the rows a human has chosen, whatever the stored order', async () => {
    const rows = await prisma.artistBioImage.findMany({
      where: { artistId, AND: [bioImageWhere.chosen] },
      select: { url: true },
    });

    expect(rows.map(({ url }) => url).sort()).toEqual(
      expectUrls((order) => order === 'zero' || order === 'two')
    );
  });

  it('counts the same rows, the publish gate’s read', async () => {
    const count = await prisma.artistBioImage.count({
      where: { artistId, AND: [bioImageWhere.chosen] },
    });

    expect(count).toBe(expectUrls((order) => order === 'zero' || order === 'two').length);
  });
});

describe('bioImageWhere.displayCandidate (Docker Mongo contract)', () => {
  it('matches a chosen row or a suggested row, whatever the stored order', async () => {
    const rows = await prisma.artistBioImage.findMany({
      where: { artistId, AND: [bioImageWhere.displayCandidate] },
      select: { url: true },
    });

    expect(rows.map(({ url }) => url).sort()).toEqual(
      expectUrls((order, primary) => primary || order === 'zero' || order === 'two')
    );
  });
});
