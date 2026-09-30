/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import {
  backfillPublishCreditedArtists,
  formatCandidatesFile,
  parseIdsFile,
  planPublish,
  type BackfillCandidate,
  type BackfillDeps,
} from './backfill-publish-credited-artists';

import type { PrismaClient } from '@prisma/client';

const NOW = new Date('2026-09-26T12:00:00.000Z');
const ID_A = 'aaaaaaaaaaaaaaaaaaaaaaaa';
const ID_B = 'bbbbbbbbbbbbbbbbbbbbbbbb';
const ID_UNKNOWN = 'cccccccccccccccccccccccc';
const ADMIN_ID = 'dddddddddddddddddddddddd';

const NOT_DELETED_OR = [{ deletedOn: null }, { deletedOn: { isSet: false } }];
const LISTED_RELEASE = { publishedAt: { not: null }, OR: NOT_DELETED_OR };
const AWAITING_WHERE = {
  releases: { some: { release: LISTED_RELEASE } },
  AND: [{ OR: [{ publishedOn: null }, { publishedOn: { isSet: false } }] }, { OR: NOT_DELETED_OR }],
};

const nameFields = {
  displayName: null,
  middleName: null,
  title: null,
  suffix: null,
};

const awaitingRow = (id: string, firstName: string) => ({
  ...nameFields,
  id,
  slug: firstName.toLowerCase(),
  firstName,
  surname: 'Example',
  bio: 'Generated text.',
  shortBio: null,
  altBio: null,
  bioGeneratedAt: NOW,
  bioImages: [{ isPrimary: true, displayOrder: null, alt: 'On stage' }],
  releases: [
    { release: { title: 'Listed Album', publishedAt: NOW, deletedOn: null } },
    { release: { title: 'Draft Album', publishedAt: null, deletedOn: null } },
    { release: { title: 'Deleted Album', publishedAt: NOW, deletedOn: NOW } },
  ],
});

const hiddenRow = {
  ...nameFields,
  id: 'eeeeeeeeeeeeeeeeeeeeeeee',
  slug: 'old-duplicate',
  firstName: 'Old',
  surname: 'Duplicate',
  deletedOn: NOW,
};

const candidate = (over: Partial<BackfillCandidate> = {}): BackfillCandidate => ({
  id: ID_A,
  slug: 'abel',
  name: 'Abel Example',
  bioState: 'generated',
  bioGeneratedAt: NOW,
  displayImageCount: 1,
  releaseTitles: ['Listed Album'],
  ...over,
});

interface Harness {
  deps: BackfillDeps;
  findMany: ReturnType<typeof vi.fn>;
  updateMany: ReturnType<typeof vi.fn>;
  writeFile: ReturnType<typeof vi.fn>;
  log: ReturnType<typeof vi.fn>;
}

const makeHarness = (idsFile = ''): Harness => {
  const findMany = vi
    .fn()
    .mockResolvedValueOnce([awaitingRow(ID_B, 'Zed'), awaitingRow(ID_A, 'Abel')])
    .mockResolvedValueOnce([hiddenRow]);
  const updateMany = vi.fn().mockResolvedValue({ count: 1 });
  const writeFile = vi.fn();
  const log = vi.fn();
  return {
    findMany,
    updateMany,
    writeFile,
    log,
    deps: {
      prisma: { artist: { findMany, updateMany }, $disconnect: vi.fn() } as unknown as PrismaClient,
      readFile: vi.fn().mockReturnValue(idsFile),
      writeFile,
      log,
      now: () => NOW,
    },
  };
};

describe('backfill-publish-credited-artists', () => {
  beforeEach(() => {
    vi.stubEnv('DATABASE_URL', 'mongodb://localhost:27018/boudreaux-e2e?replicaSet=rs0');
  });

  describe('formatCandidatesFile', () => {
    it('writes one tab-separated line per candidate, id first', () => {
      const text = formatCandidatesFile([candidate()]);

      expect(text.split('\n').filter((line) => !line.startsWith('#') && line !== '')).toEqual([
        `${ID_A}\tabel\tAbel Example\tbio: generated 2026-09-26\timages: 1\tListed Album`,
      ]);
    });

    it('names a hand-written bio without a date', () => {
      const text = formatCandidatesFile([
        candidate({ bioState: 'hand-written', bioGeneratedAt: null }),
      ]);

      expect(text).toContain('\tbio: hand-written\t');
    });

    it('joins several release titles', () => {
      const text = formatCandidatesFile([candidate({ releaseTitles: ['One', 'Two'] })]);

      expect(text).toContain('\tOne; Two');
    });

    it('strips tabs and newlines from names and titles', () => {
      const text = formatCandidatesFile([
        candidate({ name: 'Abel\tExample', releaseTitles: ['Listed\nAlbum'] }),
      ]);

      expect(text).toContain('\tAbel Example\t');
    });
  });

  describe('parseIdsFile', () => {
    it('reads the first column of each line and skips comments and blanks', () => {
      const ids = parseIdsFile(`# header\n\n${ID_A}\tabel\tAbel\n${ID_B}\n`);

      expect(ids).toEqual([ID_A, ID_B]);
    });

    it('drops a repeated id', () => {
      const ids = parseIdsFile(`${ID_A}\n${ID_A}\n`);

      expect(ids).toEqual([ID_A]);
    });

    it('rejects a line whose first column is not an ObjectId', () => {
      expect(() => parseIdsFile(`${ID_A}\nnot-an-id\tname\n`)).toThrow(
        'line 2 does not start with an artist id: "not-an-id"'
      );
    });
  });

  describe('planPublish', () => {
    it('separates ids that are no longer candidates', () => {
      const plan = planPublish([ID_A, ID_UNKNOWN], [candidate()]);

      expect(plan).toEqual({ publishIds: [ID_A], unknownIds: [ID_UNKNOWN] });
    });
  });

  describe('dry run', () => {
    it('reads the candidates credited on any listed release', async () => {
      const { deps, findMany } = makeHarness();

      await backfillPublishCreditedArtists(['--out', '/tmp/candidates.tsv'], deps);

      expect(findMany.mock.calls[0][0].where).toEqual(AWAITING_WHERE);
    });

    it('writes the candidates file ordered by name, with listed releases only', async () => {
      const { deps, writeFile } = makeHarness();

      await backfillPublishCreditedArtists(['--out', '/tmp/candidates.tsv'], deps);

      const [path, text] = writeFile.mock.calls[0] as [string, string];
      expect({
        path,
        lines: text.split('\n').filter((line) => !line.startsWith('#') && line !== ''),
      }).toEqual({
        path: '/tmp/candidates.tsv',
        lines: [
          `${ID_A}\tabel\tAbel Example\tbio: generated 2026-09-26\timages: 1\tListed Album`,
          `${ID_B}\tzed\tZed Example\tbio: generated 2026-09-26\timages: 1\tListed Album`,
        ],
      });
    });

    it('never writes to the database', async () => {
      const { deps, updateMany } = makeHarness();

      await backfillPublishCreditedArtists(['--out', '/tmp/candidates.tsv'], deps);

      expect(updateMany.mock.calls).toEqual([]);
    });

    it('reports the credits that stay hidden with the reason', async () => {
      const { deps, log } = makeHarness();

      await backfillPublishCreditedArtists(['--out', '/tmp/candidates.tsv'], deps);

      expect(log.mock.calls.flat().join('\n')).toContain('old-duplicate (Old Duplicate): deleted');
    });
  });

  describe('--execute', () => {
    const args = ['--execute', '--ids-file', '/tmp/reviewed.tsv', '--published-by', ADMIN_ID];

    it('publishes only the ids left in the reviewed file', async () => {
      const { deps, updateMany } = makeHarness(`# reviewed\n${ID_A}\tabel\n`);

      await backfillPublishCreditedArtists(args, deps);

      expect(updateMany.mock.calls).toEqual([
        [
          {
            where: { id: { in: [ID_A] }, ...AWAITING_WHERE },
            data: { publishedOn: NOW, publishedBy: ADMIN_ID },
          },
        ],
      ]);
    });

    it('refuses the whole run when an id is not a current candidate', async () => {
      const { deps } = makeHarness(`${ID_A}\n${ID_UNKNOWN}\n`);

      await expect(backfillPublishCreditedArtists(args, deps)).rejects.toThrow(
        `1 id(s) are not unpublished credits on a published release: ${ID_UNKNOWN}`
      );
    });

    it('writes nothing when it refuses', async () => {
      const { deps, updateMany } = makeHarness(`${ID_A}\n${ID_UNKNOWN}\n`);

      await backfillPublishCreditedArtists(args, deps).catch(() => undefined);

      expect(updateMany.mock.calls).toEqual([]);
    });

    it('writes nothing when the reviewed file holds no ids', async () => {
      const { deps, updateMany } = makeHarness('# everything pruned\n');

      await backfillPublishCreditedArtists(args, deps);

      expect(updateMany.mock.calls).toEqual([]);
    });

    it('requires --ids-file', async () => {
      const { deps } = makeHarness();

      await expect(
        backfillPublishCreditedArtists(['--execute', '--published-by', ADMIN_ID], deps)
      ).rejects.toThrow('--execute requires --ids-file <path>');
    });

    it('requires --published-by to be a user id', async () => {
      const { deps } = makeHarness(`${ID_A}\n`);

      await expect(
        backfillPublishCreditedArtists(
          ['--execute', '--ids-file', '/tmp/reviewed.tsv', '--published-by', 'me'],
          deps
        )
      ).rejects.toThrow('--execute requires --published-by <userId>');
    });
  });

  describe('environment', () => {
    it('refuses to run without DATABASE_URL', async () => {
      vi.stubEnv('DATABASE_URL', '');
      const { deps } = makeHarness();

      await expect(backfillPublishCreditedArtists([], deps)).rejects.toThrow(
        'DATABASE_URL env var is required'
      );
    });
  });
});
