/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { randomUUID } from 'node:crypto';

import { prisma } from '@/lib/prisma';

import { banWhere } from './ban-where';

import type { Prisma } from '@prisma/client';

// Contract: `banWhere` matches exactly the rows the rule says on a real
// MongoDB, for every way `unbannedAt` can be stored. Runs only under
// `pnpm run test:db`.

type Storage = 'absent' | 'null' | 'set';

const STORAGES: Storage[] = ['absent', 'null', 'set'];
const SET_AT = new Date('2026-01-01T00:00:00.000Z');

const dateFor = (storage: Storage): Date | null | undefined =>
  storage === 'set' ? SET_AT : storage === 'null' ? null : undefined;

const prefix = `__contract:${randomUUID()}:`;
const emailOf = (storage: Storage): string => `${prefix}unbannedAt=${storage}`;
let adminId = '';

const scope = (): Prisma.BannedIdentityWhereInput => ({ email: { startsWith: prefix } });

const expectEmails = (predicate: (storage: Storage) => boolean): string[] =>
  STORAGES.filter(predicate).map(emailOf).sort();

const findEmails = async (where: Prisma.BannedIdentityWhereInput): Promise<string[]> => {
  const rows = await prisma.bannedIdentity.findMany({
    where: { ...scope(), AND: [where] },
    select: { email: true },
  });
  return rows.map(({ email }) => email).sort();
};

beforeAll(async () => {
  const admin = await prisma.user.create({
    data: { email: `${prefix}admin@example.com`, name: 'contract admin' },
    select: { id: true },
  });
  adminId = admin.id;

  // One ban per storage. Serial creates so an omitted field is genuinely
  // absent from the document.
  for (const storage of STORAGES) {
    await prisma.bannedIdentity.create({
      data: { email: emailOf(storage), bannedByAdminId: adminId, unbannedAt: dateFor(storage) },
    });
  }
});

afterAll(async () => {
  await prisma.bannedIdentity.deleteMany({ where: scope() });
  await prisma.user.deleteMany({ where: { id: adminId } });
  await prisma.$disconnect();
});

describe('banWhere (Docker Mongo contract)', () => {
  it('seeds one row per storage', async () => {
    expect(await findEmails({})).toEqual(expectEmails(() => true));
  });

  it('active matches absent and null unbannedAt', async () => {
    expect(await findEmails(banWhere.active)).toEqual(expectEmails((storage) => storage !== 'set'));
  });

  it('a bare null filter misses the absent row (the defect this fragment replaces)', async () => {
    expect(await findEmails({ unbannedAt: null })).toEqual([emailOf('null')]);
  });

  it('lifted matches only a set unbannedAt', async () => {
    expect(await findEmails(banWhere.lifted)).toEqual(expectEmails((storage) => storage === 'set'));
  });
});
