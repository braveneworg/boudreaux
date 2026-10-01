/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { randomUUID } from 'node:crypto';

import { prisma } from '@/lib/prisma';
import { isListable } from '@/lib/utils/artist-release-credits';

import { releasePublishedFilter, releaseWhere } from './release-where';

import type { Prisma } from '@prisma/client';

// Contract: every `releaseWhere` fragment matches exactly the rows the rule
// says, on a real MongoDB, across all three ways a nullable field can be
// stored — absent, explicit null, set. Runs only under `pnpm run test:db`.

/** How a nullable DateTime is written into the seeded document. */
type Storage = 'absent' | 'null' | 'set';

const STORAGES: Storage[] = ['absent', 'null', 'set'];
const SET_AT = new Date('2026-01-01T00:00:00.000Z');

const dateFor = (storage: Storage): Date | null | undefined =>
  storage === 'set' ? SET_AT : storage === 'null' ? null : undefined;

/** A seeded row, keyed by how each nullable field was stored. */
interface SeededRow {
  key: string;
  deletedOn: Storage;
  publishedAt: Storage;
}

const prefix = `__contract:${randomUUID()}:`;
const scope = { title: { startsWith: prefix } } satisfies Prisma.ReleaseWhereInput;

const rows: SeededRow[] = STORAGES.flatMap((deletedOn) =>
  STORAGES.map((publishedAt) => ({
    key: `deletedOn=${deletedOn} publishedAt=${publishedAt}`,
    deletedOn,
    publishedAt,
  }))
);

const keysOf = (found: Array<{ title: string }>): string[] =>
  found.map(({ title }) => title.slice(prefix.length)).sort();

const expectKeys = (predicate: (row: SeededRow) => boolean): string[] =>
  rows
    .filter(predicate)
    .map(({ key }) => key)
    .sort();

const findKeys = async (where: Prisma.ReleaseWhereInput): Promise<string[]> =>
  keysOf(
    await prisma.release.findMany({ where: { ...scope, AND: [where] }, select: { title: true } })
  );

beforeAll(async () => {
  // One create per row so an omitted field is genuinely absent from the
  // document (createMany would also omit it, but a serial loop keeps the
  // read-back race in `concurrent-create-readback-race.md` out of play).
  for (const row of rows) {
    await prisma.release.create({
      data: {
        title: `${prefix}${row.key}`,
        releasedOn: SET_AT,
        coverArt: 'https://cdn.example.com/contract.webp',
        deletedOn: dateFor(row.deletedOn),
        publishedAt: dateFor(row.publishedAt),
      },
    });
  }
});

afterAll(async () => {
  await prisma.release.deleteMany({ where: scope });
  await prisma.$disconnect();
});

describe('releaseWhere (Docker Mongo contract)', () => {
  it('seeds one row per storage combination', async () => {
    expect(await findKeys({})).toEqual(expectKeys(() => true));
  });

  it('notDeleted matches absent and null deletedOn, never a set one', async () => {
    expect(await findKeys(releaseWhere.notDeleted)).toEqual(
      expectKeys(({ deletedOn }) => deletedOn !== 'set')
    );
  });

  it('deleted matches only a set deletedOn', async () => {
    expect(await findKeys(releaseWhere.deleted)).toEqual(
      expectKeys(({ deletedOn }) => deletedOn === 'set')
    );
  });

  it('unpublished matches absent and null publishedAt, never a set one', async () => {
    expect(await findKeys(releaseWhere.unpublished)).toEqual(
      expectKeys(({ publishedAt }) => publishedAt !== 'set')
    );
  });

  it('listed matches published rows that are not deleted, however "not deleted" is stored', async () => {
    expect(await findKeys(releaseWhere.listed)).toEqual(
      expectKeys(({ publishedAt, deletedOn }) => publishedAt === 'set' && deletedOn !== 'set')
    );
  });

  it('listed and its in-memory twin isListable agree on every storage', async () => {
    // The twin reads what Prisma hands back: an absent field comes back as
    // null, so the predicate sees two storages where the database sees three.
    const all = await prisma.release.findMany({
      where: scope,
      select: { title: true, publishedAt: true, deletedOn: true },
    });
    const byPredicate = keysOf(all.filter(isListable));

    expect(await findKeys(releaseWhere.listed)).toEqual(byPredicate);
  });

  it('listed composes with a caller-supplied OR without the two colliding', async () => {
    const withSearch = { ...releaseWhere.listed, OR: [{ title: { contains: 'publishedAt=set' } }] };

    expect(await findKeys(withSearch)).toEqual(
      expectKeys(({ publishedAt, deletedOn }) => publishedAt === 'set' && deletedOn !== 'set')
    );
  });

  describe('releasePublishedFilter', () => {
    it('true matches every published row, deleted or not', async () => {
      expect(await findKeys(releasePublishedFilter(true))).toEqual(
        expectKeys(({ publishedAt }) => publishedAt === 'set')
      );
    });

    it('false matches every never-published row', async () => {
      expect(await findKeys(releasePublishedFilter(false))).toEqual(
        expectKeys(({ publishedAt }) => publishedAt !== 'set')
      );
    });

    it('undefined matches everything', async () => {
      expect(await findKeys(releasePublishedFilter(undefined))).toEqual(expectKeys(() => true));
    });
  });
});
