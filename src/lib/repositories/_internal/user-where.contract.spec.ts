/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { randomUUID } from 'node:crypto';

import { prisma } from '@/lib/prisma';

import { userWhere } from './user-where';

import type { Prisma } from '@prisma/client';

// Contract: `userWhere.hasPhone` matches exactly the rows the rule says on a
// real MongoDB, for every way `phone` can be stored. Runs only under
// `pnpm run test:db`.

type Storage = 'absent' | 'null' | 'empty' | 'set';

const STORAGES: Storage[] = ['absent', 'null', 'empty', 'set'];

const phoneFor = (storage: Storage): string | null | undefined =>
  storage === 'set'
    ? '+15550001234'
    : storage === 'empty'
      ? ''
      : storage === 'null'
        ? null
        : undefined;

const prefix = `__contract:${randomUUID()}:`;
const emailOf = (storage: Storage): string => `${prefix}phone=${storage}@example.com`;

const scope = (): Prisma.UserWhereInput => ({ email: { startsWith: prefix } });

const expectEmails = (predicate: (storage: Storage) => boolean): string[] =>
  STORAGES.filter(predicate).map(emailOf).sort();

const findEmails = async (where: Prisma.UserWhereInput): Promise<string[]> => {
  const rows = await prisma.user.findMany({
    where: { ...scope(), AND: [where] },
    select: { email: true },
  });
  return rows.map(({ email }) => email).sort();
};

beforeAll(async () => {
  // One user per storage. Serial creates so an omitted field is genuinely
  // absent from the document.
  for (const storage of STORAGES) {
    await prisma.user.create({
      data: { email: emailOf(storage), name: 'contract', phone: phoneFor(storage) },
    });
  }
});

afterAll(async () => {
  await prisma.user.deleteMany({ where: scope() });
  await prisma.$disconnect();
});

describe('userWhere (Docker Mongo contract)', () => {
  it('seeds one row per storage', async () => {
    expect(await findEmails({})).toEqual(expectEmails(() => true));
  });

  it('hasPhone matches only a set, non-empty phone — not-null alone drops the absent row', async () => {
    expect(await findEmails(userWhere.hasPhone)).toEqual(
      expectEmails((storage) => storage === 'set')
    );
  });

  it('not-null alone already excludes the absent row, so the old isSet guard was redundant', async () => {
    expect(await findEmails({ phone: { not: null } })).toEqual(
      expectEmails((storage) => storage === 'set' || storage === 'empty')
    );
  });
});
