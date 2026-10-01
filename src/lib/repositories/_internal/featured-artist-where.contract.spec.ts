/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { randomUUID } from 'node:crypto';

import { prisma } from '@/lib/prisma';

import { featuredArtistWhere, featuredWindowAt } from './featured-artist-where';

import type { Prisma } from '@prisma/client';

// Contract: `featuredArtistWhere` and the window fragment match exactly the
// rows the rule says on a real MongoDB, for every way `publishedOn` and
// `featuredUntil` can be stored. Runs only under `pnpm run test:db`.

const NOW = new Date('2026-06-01T00:00:00.000Z');
const PAST = new Date('2026-01-01T00:00:00.000Z');
const FUTURE = new Date('2026-12-01T00:00:00.000Z');

type PublishedStorage = 'absent' | 'null' | 'set';
type UntilStorage = 'absent' | 'null' | 'past' | 'future';

const PUBLISHED: PublishedStorage[] = ['absent', 'null', 'set'];
const UNTIL: UntilStorage[] = ['absent', 'null', 'past', 'future'];

const publishedFor = (storage: PublishedStorage): Date | null | undefined =>
  storage === 'set' ? PAST : storage === 'null' ? null : undefined;
const untilFor = (storage: UntilStorage): Date | null | undefined =>
  storage === 'past' ? PAST : storage === 'future' ? FUTURE : storage === 'null' ? null : undefined;

const prefix = `__contract:${randomUUID()}:`;
const nameOf = (published: PublishedStorage, until: UntilStorage): string =>
  `${prefix}publishedOn=${published}:featuredUntil=${until}`;

// The storage-pair rows; one extra row, featured in the future, sits outside.
const scope = (): Prisma.FeaturedArtistWhereInput => ({
  displayName: { startsWith: `${prefix}publishedOn=` },
});
const FEATURED_AHEAD = `${prefix}featuredOn=future`;

const expectNames = (
  predicate: (published: PublishedStorage, until: UntilStorage) => boolean
): string[] =>
  PUBLISHED.flatMap((published) =>
    UNTIL.filter((until) => predicate(published, until)).map((until) => nameOf(published, until))
  ).sort();

const findNames = async (where: Prisma.FeaturedArtistWhereInput): Promise<string[]> => {
  const rows = await prisma.featuredArtist.findMany({
    where: { ...scope(), AND: [where] },
    select: { displayName: true },
  });
  return rows.map(({ displayName }) => displayName ?? '').sort();
};

beforeAll(async () => {
  // One row per (publishedOn, featuredUntil) storage pair, all featured in the
  // past. Serial creates so an omitted field is genuinely absent.
  for (const published of PUBLISHED) {
    for (const until of UNTIL) {
      await prisma.featuredArtist.create({
        data: {
          displayName: nameOf(published, until),
          featuredOn: PAST,
          publishedOn: publishedFor(published),
          featuredUntil: untilFor(until),
        },
      });
    }
  }
  await prisma.featuredArtist.create({
    data: { displayName: FEATURED_AHEAD, featuredOn: FUTURE, publishedOn: PAST },
  });
});

afterAll(async () => {
  await prisma.featuredArtist.deleteMany({ where: { displayName: { startsWith: prefix } } });
  await prisma.$disconnect();
});

describe('featuredArtistWhere (Docker Mongo contract)', () => {
  it('seeds one row per storage pair', async () => {
    expect(await findNames({})).toEqual(expectNames(() => true));
  });

  it('unpublished matches absent and null publishedOn; published only a set one', async () => {
    expect(await findNames(featuredArtistWhere.unpublished)).toEqual(
      expectNames((published) => published !== 'set')
    );
    expect(await findNames(featuredArtistWhere.published)).toEqual(
      expectNames((published) => published === 'set')
    );
  });

  it('a bare null filter misses the absent row (the defect the fragments replace)', async () => {
    expect(await findNames({ featuredUntil: null })).toEqual(
      expectNames((_, until) => until === 'null')
    );
  });

  it('the window at now keeps an open-ended or future featuredUntil and drops a past one', async () => {
    expect(await findNames(featuredWindowAt(NOW))).toEqual(
      expectNames((_, until) => until !== 'past')
    );
  });

  it('the window at now excludes a row whose featuredOn is still ahead', async () => {
    const rows = await prisma.featuredArtist.findMany({
      where: { displayName: FEATURED_AHEAD, AND: [featuredWindowAt(NOW)] },
      select: { id: true },
    });

    expect(rows).toEqual([]);
  });
});
