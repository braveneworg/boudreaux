/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { backfillCreditPositions, planPositions } from './backfill-credit-positions';

import type { PrismaClient } from '@prisma/client';

// Rows arrive in `creditOrderBy` order: by position, then by id. A legacy
// release has every position at 0, so its rows come in id (insertion) order;
// a stamped release comes in its stored order.
const row = (id: string, releaseId: string, position = 0) => ({ id, releaseId, position });

describe('planPositions', () => {
  it('ranks a legacy release by the order its rows arrive in', () => {
    expect(planPositions([row('a', 'r1'), row('b', 'r1'), row('c', 'r1')])).toEqual([
      { id: 'b', position: 1 },
      { id: 'c', position: 2 },
    ]);
  });

  it('is idempotent: a release whose positions are already dense needs no update', () => {
    expect(planPositions([row('c', 'r1', 0), row('a', 'r1', 1), row('b', 'r1', 2)])).toEqual([]);
  });

  it('keeps a stamped order and only fills the gaps', () => {
    // Positions 0 and 2 are stamped; the row at 0-by-default sorts between them.
    expect(planPositions([row('x', 'r1', 0), row('y', 'r1', 0), row('z', 'r1', 2)])).toEqual([
      { id: 'y', position: 1 },
    ]);
  });

  it('ranks each release on its own', () => {
    expect(
      planPositions([
        row('a', 'r1'),
        row('b', 'r1'),
        row('c', 'r2'),
        row('d', 'r2'),
        row('e', 'r2'),
      ])
    ).toEqual([
      { id: 'b', position: 1 },
      { id: 'd', position: 1 },
      { id: 'e', position: 2 },
    ]);
  });

  it('plans nothing for no rows', () => {
    expect(planPositions([])).toEqual([]);
  });
});

describe('backfillCreditPositions', () => {
  const rows = [row('a', 'r1'), row('b', 'r1'), row('c', 'r2')];

  const makePrisma = () => {
    const findMany = vi.fn().mockResolvedValue(rows);
    const update = vi.fn().mockImplementation((args: unknown) => Promise.resolve(args));
    const $transaction = vi.fn(async (ops: Promise<unknown>[]) => Promise.all(ops));
    return {
      prisma: { artistRelease: { findMany, update }, $transaction } as unknown as PrismaClient,
      findMany,
      update,
      $transaction,
    };
  };

  beforeEach(() => {
    vi.stubEnv('DATABASE_URL', 'mongodb://localhost:27018/spec?replicaSet=rs0');
  });

  it('refuses to run without DATABASE_URL', async () => {
    vi.stubEnv('DATABASE_URL', '');

    await expect(backfillCreditPositions([], { prisma: makePrisma().prisma })).rejects.toThrow(
      /DATABASE_URL/
    );
  });

  it('reads every credit in credit order and only reports on a dry run', async () => {
    const { prisma, findMany, update, $transaction } = makePrisma();
    const log = vi.fn();

    await backfillCreditPositions([], { prisma, log });

    expect(findMany.mock.calls).toEqual([
      [
        {
          select: { id: true, releaseId: true, position: true },
          orderBy: [{ position: 'asc' }, { id: 'asc' }],
        },
      ],
    ]);
    expect(update).not.toHaveBeenCalled();
    expect($transaction).not.toHaveBeenCalled();
    expect(log.mock.calls.flat().join('\n')).toMatch(/1 credit\(s\) of 3 need a position/);
    expect(log.mock.calls.flat().join('\n')).toMatch(/--execute/);
  });

  it('stamps the planned positions in one transaction with --execute', async () => {
    const { prisma, update, $transaction } = makePrisma();
    const log = vi.fn();

    await backfillCreditPositions(['--execute'], { prisma, log });

    expect(update.mock.calls).toEqual([[{ where: { id: 'b' }, data: { position: 1 } }]]);
    expect($transaction).toHaveBeenCalledTimes(1);
    expect(log.mock.calls.flat().join('\n')).toMatch(/Stamped 1 credit\(s\)/);
  });

  it('writes nothing with --execute when every position is already dense', async () => {
    const { prisma, findMany, update, $transaction } = makePrisma();
    findMany.mockResolvedValue([row('a', 'r1', 0), row('b', 'r1', 1)]);

    await backfillCreditPositions(['--execute'], { prisma, log: vi.fn() });

    expect(update).not.toHaveBeenCalled();
    expect($transaction).not.toHaveBeenCalled();
  });
});
