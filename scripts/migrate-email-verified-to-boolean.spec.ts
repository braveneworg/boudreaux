/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import {
  countNonBooleanEmailVerified,
  migrateEmailVerified,
  runEmailVerifiedMigration,
} from './migrate-email-verified-to-boolean';

import type { PrismaClient } from '@prisma/client';

const makePrisma = (runCommandRaw: ReturnType<typeof vi.fn>): PrismaClient =>
  ({ $runCommandRaw: runCommandRaw, $disconnect: vi.fn() }) as unknown as PrismaClient;

const NON_BOOLEAN_FILTER = { emailVerified: { $not: { $type: 'bool' } } };

describe('migrate-email-verified-to-boolean', () => {
  beforeEach(() => {
    vi.stubEnv('DATABASE_URL', 'mongodb://localhost:27017/test');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  describe('countNonBooleanEmailVerified', () => {
    it('counts only User docs whose emailVerified is not already a boolean', async () => {
      const run = vi.fn().mockResolvedValue({ n: 3, ok: 1 });

      const count = await countNonBooleanEmailVerified(makePrisma(run));

      expect(count).toBe(3);
      expect(run).toHaveBeenCalledWith({ count: 'User', query: NON_BOOLEAN_FILTER });
    });
  });

  describe('runEmailVerifiedMigration', () => {
    it('maps a Date to true and anything else to false, leaving booleans untouched', async () => {
      const run = vi.fn().mockResolvedValue({ n: 3, nModified: 3, ok: 1 });

      const modified = await runEmailVerifiedMigration(makePrisma(run));

      expect(modified).toBe(3);
      expect(run).toHaveBeenCalledWith({
        update: 'User',
        updates: [
          {
            q: NON_BOOLEAN_FILTER,
            u: [{ $set: { emailVerified: { $eq: [{ $type: '$emailVerified' }, 'date'] } } }],
            multi: true,
          },
        ],
      });
    });
  });

  describe('migrateEmailVerified', () => {
    it('dry-runs by default: counts but never updates', async () => {
      const run = vi.fn().mockResolvedValue({ n: 2, ok: 1 });

      await migrateEmailVerified([], { prisma: makePrisma(run) });

      expect(run).toHaveBeenCalledTimes(1);
      expect(run).toHaveBeenCalledWith(expect.objectContaining({ count: 'User' }));
    });

    it('writes the conversion when --execute is passed', async () => {
      const run = vi.fn().mockResolvedValue({ nModified: 2, ok: 1 });

      await migrateEmailVerified(['--execute'], { prisma: makePrisma(run) });

      expect(run).toHaveBeenCalledWith(expect.objectContaining({ update: 'User' }));
    });

    it('does not disconnect an injected client (caller owns its lifecycle)', async () => {
      const run = vi.fn().mockResolvedValue({ n: 0, ok: 1 });
      const prisma = makePrisma(run);

      await migrateEmailVerified([], { prisma });

      expect(prisma.$disconnect).not.toHaveBeenCalled();
    });
  });
});
