/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import {
  dedupeArtistBioLinks,
  deleteBioLinkDuplicates,
  formatDryRunReport,
  planBioLinkDedupe,
  type BioLinkRow,
} from './dedupe-artist-bio-links';

import type { PrismaClient } from '@prisma/client';

const makePrisma = (rows: BioLinkRow[], deleteResult = { count: 0 }): PrismaClient =>
  ({
    artistBioLink: {
      findMany: vi.fn().mockResolvedValue(rows),
      deleteMany: vi.fn().mockResolvedValue(deleteResult),
    },
    $disconnect: vi.fn(),
  }) as unknown as PrismaClient;

const row = (over: Partial<BioLinkRow>): BioLinkRow => ({
  id: 'id',
  artistId: 'a1',
  url: 'https://example.com',
  origin: 'generated',
  sortOrder: 0,
  ...over,
});

describe('dedupe-artist-bio-links', () => {
  describe('planBioLinkDedupe', () => {
    it('keeps the custom row and deletes the generated duplicate of the same url', () => {
      const rows = [
        row({ id: 'gen', origin: 'generated', sortOrder: 0 }),
        row({ id: 'cus', origin: 'custom', sortOrder: 5 }),
      ];

      const plan = planBioLinkDedupe(rows);

      expect(plan.deleteIds).toEqual(['gen']);
    });

    it('breaks ties by lowest sortOrder when origins are equal', () => {
      const rows = [
        row({ id: 'high', url: 'https://y', origin: 'generated', sortOrder: 2 }),
        row({ id: 'low', url: 'https://y', origin: 'generated', sortOrder: 1 }),
      ];

      const plan = planBioLinkDedupe(rows);

      expect(plan.deleteIds).toEqual(['high']);
    });

    it('reports the number of exact-duplicate groups', () => {
      const rows = [row({ id: 'a', url: 'https://y' }), row({ id: 'b', url: 'https://y' })];

      const plan = planBioLinkDedupe(rows);

      expect(plan.exactDuplicateGroups).toBe(1);
    });

    it('leaves distinct urls untouched', () => {
      const rows = [row({ id: 'a', url: 'https://a' }), row({ id: 'b', url: 'https://b' })];

      const plan = planBioLinkDedupe(rows);

      expect(plan.deleteIds).toEqual([]);
    });

    it('does not treat the same url under different artists as a duplicate', () => {
      const rows = [
        row({ id: 'a', artistId: 'a1', url: 'https://y' }),
        row({ id: 'b', artistId: 'a2', url: 'https://y' }),
      ];

      const plan = planBioLinkDedupe(rows);

      expect(plan.deleteIds).toEqual([]);
    });

    it('counts a case-only variant as index-safe and never deletes it', () => {
      const rows = [
        row({ id: 'upper', url: 'https://Case' }),
        row({ id: 'lower', url: 'https://case' }),
      ];

      const plan = planBioLinkDedupe(rows);

      expect(plan.caseVariantGroups).toBe(1);
    });

    it('keeps both case-variant rows (the exact index permits them)', () => {
      const rows = [
        row({ id: 'upper', url: 'https://Case' }),
        row({ id: 'lower', url: 'https://case' }),
      ];

      const plan = planBioLinkDedupe(rows);

      expect(plan.deleteIds).toEqual([]);
    });

    it('surfaces a sample of the kept survivor for each duplicate group', () => {
      const rows = [
        row({ id: 'gen', origin: 'generated', sortOrder: 3 }),
        row({ id: 'cus', origin: 'custom', sortOrder: 9 }),
      ];

      const plan = planBioLinkDedupe(rows);

      expect(plan.samples).toEqual([
        { artistId: 'a1', url: 'https://example.com', count: 2, keepId: 'cus' },
      ]);
    });
  });

  describe('deleteBioLinkDuplicates', () => {
    it('returns 0 and never calls deleteMany when there are no ids', async () => {
      const prisma = makePrisma([]);

      const deleted = await deleteBioLinkDuplicates(prisma, []);

      expect(deleted).toBe(0);
    });

    it('deletes the given ids and returns the removed count', async () => {
      const prisma = makePrisma([], { count: 2 });

      const deleted = await deleteBioLinkDuplicates(prisma, ['x', 'y']);

      expect(prisma.artistBioLink.deleteMany).toHaveBeenCalledWith({
        where: { id: { in: ['x', 'y'] } },
      });
      expect(deleted).toBe(2);
    });
  });

  describe('formatDryRunReport', () => {
    it('states the index will build cleanly when there are no duplicates', () => {
      const report = formatDryRunReport(planBioLinkDedupe([row({ id: 'only' })]));

      expect(report).toContain('index will build cleanly');
    });

    it('prompts to re-run with --execute when duplicates exist', () => {
      const rows = [row({ id: 'a', url: 'https://y' }), row({ id: 'b', url: 'https://y' })];

      const report = formatDryRunReport(planBioLinkDedupe(rows));

      expect(report).toContain('Re-run with --execute');
    });
  });

  describe('dedupeArtistBioLinks', () => {
    beforeEach(() => {
      vi.stubEnv('DATABASE_URL', 'mongodb://localhost:27017/test');
    });

    afterEach(() => {
      vi.unstubAllEnvs();
    });

    it('dry-runs by default: reads rows but never deletes', async () => {
      const rows = [row({ id: 'a', url: 'https://y' }), row({ id: 'b', url: 'https://y' })];
      const prisma = makePrisma(rows);

      await dedupeArtistBioLinks([], { prisma });

      expect(prisma.artistBioLink.deleteMany).not.toHaveBeenCalled();
    });

    it('deletes the planned duplicate ids when --execute is passed', async () => {
      const rows = [row({ id: 'a', url: 'https://y' }), row({ id: 'b', url: 'https://y' })];
      const prisma = makePrisma(rows, { count: 1 });

      await dedupeArtistBioLinks(['--execute'], { prisma });

      expect(prisma.artistBioLink.deleteMany).toHaveBeenCalledWith({
        where: { id: { in: ['b'] } },
      });
    });

    it('does not disconnect an injected client (caller owns its lifecycle)', async () => {
      const prisma = makePrisma([]);

      await dedupeArtistBioLinks([], { prisma });

      expect(prisma.$disconnect).not.toHaveBeenCalled();
    });
  });
});
