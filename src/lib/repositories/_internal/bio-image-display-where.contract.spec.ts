/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { randomUUID } from 'node:crypto';

import { prisma } from '@/lib/prisma';

import { bioImageWhere } from './bio-media-where';

// Contract: `bioImageWhere.displayCandidate` matches exactly the rows the
// card's display image can come from — a human's chosen row (any numeric
// `displayOrder`) or the job's suggested row (`isPrimary`) — and
// `bioImageWhere.pageCandidate` the rows the artist page's can — a chosen row
// or a row whose `alt` is set — for every way `displayOrder` and `alt` can be
// stored. Runs only under `pnpm run test:db`.

type OrderStorage = 'absent' | 'null' | 'zero' | 'two';
const ORDERS: OrderStorage[] = ['absent', 'null', 'zero', 'two'];
const PRIMARIES = [true, false] as const;

type AltStorage = 'absent' | 'null' | 'empty' | 'text';
const ALTS: AltStorage[] = ['absent', 'null', 'empty', 'text'];

const orderFor = (storage: OrderStorage): number | null | undefined =>
  storage === 'absent' ? undefined : storage === 'null' ? null : storage === 'zero' ? 0 : 2;

const altFor = (storage: AltStorage): string | null | undefined =>
  storage === 'absent'
    ? undefined
    : storage === 'null'
      ? null
      : storage === 'empty'
        ? ''
        : 'Described';

const prefix = `__contract:${randomUUID()}:`;
let artistId = '';
// The `alt` matrix hangs off its own artist, so each fragment's case reads
// only the rows seeded for it.
let altArtistId = '';

const urlOf = (order: OrderStorage, primary: boolean): string =>
  `${prefix}order=${order}:primary=${primary}`;

const expectUrls = (predicate: (order: OrderStorage, primary: boolean) => boolean): string[] =>
  ORDERS.flatMap((order) =>
    PRIMARIES.filter((primary) => predicate(order, primary)).map((primary) => urlOf(order, primary))
  ).sort();

const altUrlOf = (order: OrderStorage, alt: AltStorage): string =>
  `${prefix}alt:order=${order}:alt=${alt}`;

const expectAltUrls = (predicate: (order: OrderStorage, alt: AltStorage) => boolean): string[] =>
  ORDERS.flatMap((order) =>
    ALTS.filter((alt) => predicate(order, alt)).map((alt) => altUrlOf(order, alt))
  ).sort();

const createArtist = async (slug: string): Promise<string> => {
  const { id } = await prisma.artist.create({
    data: { firstName: prefix, surname: 'contract', slug: `${prefix}${slug}` },
    select: { id: true },
  });
  return id;
};

beforeAll(async () => {
  artistId = await createArtist('slug');
  altArtistId = await createArtist('alt-slug');
  // Serial creates so an omitted `displayOrder` or `alt` is genuinely absent.
  for (const order of ORDERS) {
    const displayOrder = orderFor(order);
    for (const isPrimary of PRIMARIES) {
      await prisma.artistBioImage.create({
        data: {
          artistId,
          url: urlOf(order, isPrimary),
          isPrimary,
          ...(displayOrder !== undefined && { displayOrder }),
        },
      });
    }
    for (const altStorage of ALTS) {
      const alt = altFor(altStorage);
      await prisma.artistBioImage.create({
        data: {
          artistId: altArtistId,
          url: altUrlOf(order, altStorage),
          isPrimary: false,
          ...(displayOrder !== undefined && { displayOrder }),
          ...(alt !== undefined && { alt }),
        },
      });
    }
  }
});

afterAll(async () => {
  await prisma.artistBioImage.deleteMany({ where: { artistId: { in: [artistId, altArtistId] } } });
  await prisma.artist.deleteMany({ where: { id: { in: [artistId, altArtistId] } } });
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

describe('bioImageWhere.pageCandidate (Docker Mongo contract)', () => {
  // An empty alt is set, so it is read; the resolver then skips it, as it
  // skips whitespace (`isDisplayEligible`).
  it('matches a chosen row or a row whose alt is set, whatever the stored order and alt', async () => {
    const rows = await prisma.artistBioImage.findMany({
      where: { artistId: altArtistId, AND: [bioImageWhere.pageCandidate] },
      select: { url: true },
    });

    expect(rows.map(({ url }) => url).sort()).toEqual(
      expectAltUrls(
        (order, alt) => order === 'zero' || order === 'two' || alt === 'empty' || alt === 'text'
      )
    );
  });
});
