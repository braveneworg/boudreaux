/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { randomUUID } from 'node:crypto';

import { prisma } from '@/lib/prisma';
import { DataError } from '@/lib/types/domain/errors';

// Contract: the `data-error-translation` client extension sits on the live
// client path, so a real MongoDB failure leaves the client as a `DataError`
// with the mapped code — which the unit spec's stub `query` cannot prove.
// Runs only under `pnpm run test:db`.

const prefix = `__contract:${randomUUID()}:`;
const SET_AT = new Date('2026-01-01T00:00:00.000Z');
const MISSING_ID = '000000000000000000000000';

const release = (suffix: string) => ({
  title: `${prefix}${suffix}`,
  releasedOn: SET_AT,
  coverArt: 'https://cdn.example.com/contract.webp',
});

beforeAll(async () => {
  // The schema declares `Release.title @unique`; a scratch database only has
  // the index once something creates it, so make the duplicate case
  // deterministic here instead of depending on a prior `prisma db push`.
  await prisma.$runCommandRaw({
    createIndexes: 'Release',
    indexes: [{ key: { title: 1 }, name: 'Release_title_key', unique: true }],
  });
});

afterAll(async () => {
  await prisma.release.deleteMany({ where: { title: { startsWith: prefix } } });
  await prisma.$disconnect();
});

describe('data-error-translation (Docker Mongo contract)', () => {
  it('a unique-index violation surfaces as DataError DUPLICATE', async () => {
    await prisma.release.create({ data: release('dup') });

    const rejection = prisma.release.create({ data: release('dup') });

    await expect(rejection).rejects.toBeInstanceOf(DataError);
    await expect(rejection).rejects.toMatchObject({ code: 'DUPLICATE' });
  });

  it('an update of a missing row surfaces as DataError NOT_FOUND', async () => {
    const rejection = prisma.release.update({
      where: { id: MISSING_ID },
      data: { title: `${prefix}never` },
    });

    await expect(rejection).rejects.toBeInstanceOf(DataError);
    await expect(rejection).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('a malformed id surfaces as DataError VALIDATION', async () => {
    const rejection = prisma.release.findUnique({ where: { id: 'not-an-object-id' } });

    await expect(rejection).rejects.toBeInstanceOf(DataError);
    await expect(rejection).rejects.toMatchObject({ code: 'VALIDATION' });
  });

  it('operations inside an interactive transaction are translated too', async () => {
    const rejection = prisma.$transaction(async (tx) =>
      tx.release.update({ where: { id: MISSING_ID }, data: { title: `${prefix}tx` } })
    );

    await expect(rejection).rejects.toBeInstanceOf(DataError);
    await expect(rejection).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });
});
