/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { randomUUID } from 'node:crypto';

import { prisma } from '@/lib/prisma';

import { digitalFormatWhere } from './digital-format-where';

import type { Prisma } from '@prisma/client';

// Contract: `digitalFormatWhere` matches exactly the rows the rule says on a
// real MongoDB, for every way `deletedAt` can be stored. Runs only under
// `pnpm run test:db`.

type Storage = 'absent' | 'null' | 'set';

const STORAGES: Storage[] = ['absent', 'null', 'set'];
const SET_AT = new Date('2026-01-01T00:00:00.000Z');

const dateFor = (storage: Storage): Date | null | undefined =>
  storage === 'set' ? SET_AT : storage === 'null' ? null : undefined;

const prefix = `__contract:${randomUUID()}:`;
let releaseId = '';

const scope = (): Prisma.ReleaseDigitalFormatWhereInput => ({ releaseId });

const expectTypes = (predicate: (storage: Storage) => boolean): string[] =>
  STORAGES.filter(predicate)
    .map((storage) => `deletedAt=${storage}`)
    .sort();

const findTypes = async (where: Prisma.ReleaseDigitalFormatWhereInput): Promise<string[]> => {
  const rows = await prisma.releaseDigitalFormat.findMany({
    where: { ...scope(), AND: [where] },
    select: { formatType: true },
  });
  return rows.map(({ formatType }) => formatType).sort();
};

beforeAll(async () => {
  const release = await prisma.release.create({
    data: {
      title: `${prefix}release`,
      releasedOn: SET_AT,
      coverArt: 'https://cdn.example.com/contract.webp',
    },
    select: { id: true },
  });
  releaseId = release.id;

  // One row per storage, keyed by `formatType` (unique per release). Serial
  // creates so an omitted field is genuinely absent from the document.
  for (const storage of STORAGES) {
    await prisma.releaseDigitalFormat.create({
      data: { releaseId, formatType: `deletedAt=${storage}`, deletedAt: dateFor(storage) },
    });
  }
});

afterAll(async () => {
  await prisma.releaseDigitalFormat.deleteMany({ where: scope() });
  await prisma.release.deleteMany({ where: { title: { startsWith: prefix } } });
  await prisma.$disconnect();
});

describe('digitalFormatWhere (Docker Mongo contract)', () => {
  it('seeds one row per storage', async () => {
    expect(await findTypes({})).toEqual(expectTypes(() => true));
  });

  it('active matches absent and null deletedAt — the bare `{ deletedAt: null }` missed absent', async () => {
    expect(await findTypes(digitalFormatWhere.active)).toEqual(
      expectTypes((storage) => storage !== 'set')
    );
  });

  it('a bare null filter misses the absent row (the defect this fragment replaces)', async () => {
    expect(await findTypes({ deletedAt: null })).toEqual(['deletedAt=null']);
  });

  it('withdrawn matches only a set deletedAt', async () => {
    expect(await findTypes(digitalFormatWhere.withdrawn)).toEqual(
      expectTypes((storage) => storage === 'set')
    );
  });
});
