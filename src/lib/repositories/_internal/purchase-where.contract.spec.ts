/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { randomUUID } from 'node:crypto';

import { prisma } from '@/lib/prisma';

import { purchaseWhere } from './purchase-where';

import type { Prisma } from '@prisma/client';

// Contract: `purchaseWhere` matches exactly the rows the rule says on a real
// MongoDB, for every way `refundedAt` can be stored. Runs only under
// `pnpm run test:db`.

type Storage = 'absent' | 'null' | 'set';

const STORAGES: Storage[] = ['absent', 'null', 'set'];
const SET_AT = new Date('2026-01-01T00:00:00.000Z');

const dateFor = (storage: Storage): Date | null | undefined =>
  storage === 'set' ? SET_AT : storage === 'null' ? null : undefined;

const prefix = `__contract:${randomUUID()}:`;
const intentOf = (storage: Storage): string => `${prefix}refundedAt=${storage}`;
let userId = '';

const scope = (): Prisma.ReleasePurchaseWhereInput => ({ userId });

const expectIntents = (predicate: (storage: Storage) => boolean): string[] =>
  STORAGES.filter(predicate).map(intentOf).sort();

const findIntents = async (where: Prisma.ReleasePurchaseWhereInput): Promise<string[]> => {
  const rows = await prisma.releasePurchase.findMany({
    where: { ...scope(), AND: [where] },
    select: { stripePaymentIntentId: true },
  });
  return rows.map(({ stripePaymentIntentId }) => stripePaymentIntentId).sort();
};

beforeAll(async () => {
  const user = await prisma.user.create({
    data: { email: `${prefix}@example.com`, name: 'contract' },
    select: { id: true },
  });
  userId = user.id;

  // One purchase per storage, each on its own release (one purchase per user
  // per release). Serial creates so an omitted field is genuinely absent.
  for (const storage of STORAGES) {
    const release = await prisma.release.create({
      data: {
        title: `${prefix}release:${storage}`,
        releasedOn: SET_AT,
        coverArt: 'https://cdn.example.com/contract.webp',
      },
      select: { id: true },
    });
    await prisma.releasePurchase.create({
      data: {
        userId,
        releaseId: release.id,
        amountPaid: 500,
        stripePaymentIntentId: intentOf(storage),
        refundedAt: dateFor(storage),
      },
    });
  }
});

afterAll(async () => {
  await prisma.releasePurchase.deleteMany({ where: scope() });
  await prisma.release.deleteMany({ where: { title: { startsWith: prefix } } });
  await prisma.user.deleteMany({ where: { id: userId } });
  await prisma.$disconnect();
});

describe('purchaseWhere (Docker Mongo contract)', () => {
  it('seeds one row per storage', async () => {
    expect(await findIntents({})).toEqual(expectIntents(() => true));
  });

  it('active matches absent and null refundedAt', async () => {
    expect(await findIntents(purchaseWhere.active)).toEqual(
      expectIntents((storage) => storage !== 'set')
    );
  });

  it('a bare null filter misses the absent row (the defect this fragment replaces)', async () => {
    expect(await findIntents({ refundedAt: null })).toEqual([intentOf('null')]);
  });

  it('refunded matches only a set refundedAt', async () => {
    expect(await findIntents(purchaseWhere.refunded)).toEqual(
      expectIntents((storage) => storage === 'set')
    );
  });
});
