/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { randomBytes, randomUUID } from 'node:crypto';

import { prisma } from '@/lib/prisma';
import { DataError } from '@/lib/types/domain/errors';
import type { ReleaseForDeletion } from '@/lib/types/domain/release';

import { ReleaseRepository } from './release-repository';

// Contract: a release delete removes the release and every row keyed to it in
// one MongoDB transaction, and keeps the credited artists and the featured
// artist that pointed at it. A failure at its last step leaves every row as
// it was. Runs only under `pnpm run test:db`.

const prefix = `__contract:${randomUUID()}:`;
const EARLIER = new Date('2026-01-01T00:00:00.000Z');
const FORMAT_TYPES = ['MP3_320KBPS', 'FLAC'];
const TRACK_NUMBERS = [1, 2];
const INJECTED = new Error(`${prefix}injected failure of the final release delete`);

type Label = 'deleted' | 'sibling' | 'failed';
type TransactionClient = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];

/** The ids of the rows of one release, per collection, sorted. */
interface ReleaseRows {
  release: string[];
  formats: string[];
  files: string[];
  purchases: string[];
  downloads: string[];
  events: string[];
  releaseUrls: string[];
  images: string[];
  credits: string[];
}

const SEEDED_COUNTS: Record<keyof ReleaseRows, number> = {
  release: 1,
  formats: 2,
  files: 4,
  purchases: 1,
  downloads: 1,
  events: 1,
  releaseUrls: 1,
  images: 1,
  credits: 2,
};

const noRows = (): ReleaseRows => ({
  release: [],
  formats: [],
  files: [],
  purchases: [],
  downloads: [],
  events: [],
  releaseUrls: [],
  images: [],
  credits: [],
});

const releaseIds: string[] = [];
const artistIds: string[] = [];
const releaseOf: Record<Label, string> = { deleted: '', sibling: '', failed: '' };
const seeded: Record<Label, ReleaseRows> = {
  deleted: noRows(),
  sibling: noRows(),
  failed: noRows(),
};
const remaining: Record<Label, ReleaseRows> = {
  deleted: noRows(),
  sibling: noRows(),
  failed: noRows(),
};
const outcome: Record<'deleted' | 'failed' | 'missing', unknown> = {
  deleted: null,
  failed: null,
  missing: null,
};
let userId = '';
let featuredArtistId = '';
let deletedView: ReleaseForDeletion | null = null;
/** C's rows as its own transaction saw them when the final step failed. */
let seenAtFailure: ReleaseRows = noRows();

const s3KeyOf = (label: Label, formatType: string, trackNumber: number): string =>
  `${prefix}${label}/${formatType}/${trackNumber}`;

const sortedIds = (rows: Array<{ id: string }>): string[] => rows.map(({ id }) => id).sort();

/** Run a write and keep what it threw, or null when it went through. */
const errorOf = async (write: () => Promise<unknown>): Promise<unknown> => {
  try {
    await write();
    return null;
  } catch (error) {
    return error;
  }
};

const seedRelease = async (label: Label): Promise<string> => {
  const { id } = await prisma.release.create({
    data: {
      title: `${prefix}${label}`,
      releasedOn: EARLIER,
      coverArt: `https://cdn.example.com/${prefix}${label}/cover.webp`,
    },
    select: { id: true },
  });
  releaseIds.push(id);
  for (const formatType of FORMAT_TYPES) {
    await prisma.releaseDigitalFormat.create({
      data: {
        releaseId: id,
        formatType,
        files: {
          create: TRACK_NUMBERS.map((trackNumber) => ({
            trackNumber,
            s3Key: s3KeyOf(label, formatType, trackNumber),
            fileName: `${trackNumber}.audio`,
            fileSize: BigInt(1024),
            mimeType: 'audio/mpeg',
          })),
        },
      },
    });
  }
  await prisma.releasePurchase.create({
    data: { userId, releaseId: id, amountPaid: 500, stripePaymentIntentId: `${prefix}${label}` },
  });
  await prisma.releaseDownload.create({ data: { userId, releaseId: id, downloadCount: 1 } });
  await prisma.downloadEvent.create({
    data: { userId, releaseId: id, formatType: 'FLAC', success: true },
  });
  await prisma.releaseUrl.create({
    data: {
      release: { connect: { id } },
      url: { create: { platform: 'BANDCAMP', url: `${prefix}${label}` } },
    },
  });
  await prisma.image.create({
    data: { releaseId: id, src: `https://cdn.example.com/${prefix}${label}/image.webp` },
  });
  await prisma.artistRelease.createMany({
    data: artistIds.map((artistId, position) => ({ artistId, releaseId: id, position })),
  });
  return id;
};

/** Read one release's rows; files are found by the formats it was seeded with. */
const rowsOf = async (
  client: TransactionClient,
  releaseId: string,
  formatIds: string[]
): Promise<ReleaseRows> => {
  const byRelease = { where: { releaseId }, select: { id: true } };
  return {
    release: sortedIds(
      await client.release.findMany({ where: { id: releaseId }, select: { id: true } })
    ),
    formats: sortedIds(await client.releaseDigitalFormat.findMany(byRelease)),
    files: sortedIds(
      await client.releaseDigitalFormatFile.findMany({
        where: { formatId: { in: formatIds } },
        select: { id: true },
      })
    ),
    purchases: sortedIds(await client.releasePurchase.findMany(byRelease)),
    downloads: sortedIds(await client.releaseDownload.findMany(byRelease)),
    events: sortedIds(await client.downloadEvent.findMany(byRelease)),
    releaseUrls: sortedIds(await client.releaseUrl.findMany(byRelease)),
    images: sortedIds(await client.image.findMany(byRelease)),
    credits: sortedIds(await client.artistRelease.findMany(byRelease)),
  };
};

/** Read a seeded release's rows, finding its files by its formats. */
const seededRowsOf = async (releaseId: string): Promise<ReleaseRows> => {
  const formats = await prisma.releaseDigitalFormat.findMany({
    where: { releaseId },
    select: { id: true },
  });
  return rowsOf(prisma, releaseId, sortedIds(formats));
};

/**
 * The transaction client with a `release.delete` that rejects. Before it
 * rejects, it reads C's rows through the same transaction, which shows the
 * failure comes after every child step has written.
 */
const withFailingReleaseDelete = (tx: TransactionClient): TransactionClient =>
  new Proxy(tx, {
    get: (target, key) =>
      key === 'release'
        ? new Proxy(target.release, {
            get: (model, operation) =>
              operation === 'delete'
                ? async () => {
                    seenAtFailure = await rowsOf(target, releaseOf.failed, seeded.failed.formats);
                    throw INJECTED;
                  }
                : Reflect.get(model, operation),
          })
        : Reflect.get(target, key),
  });

// Every row is seeded, and every write is run, here: the tests run shuffled
// and only read. Rows whose id is needed back are created one at a time.
beforeAll(async () => {
  ({ id: userId } = await prisma.user.create({
    data: { email: `${prefix}buyer@example.com` },
    select: { id: true },
  }));
  for (const label of ['lead', 'guest']) {
    const { id } = await prisma.artist.create({
      data: { firstName: prefix, surname: label, slug: `${prefix}${label}` },
      select: { id: true },
    });
    artistIds.push(id);
  }
  releaseOf.deleted = await seedRelease('deleted');
  releaseOf.sibling = await seedRelease('sibling');
  releaseOf.failed = await seedRelease('failed');
  ({ id: featuredArtistId } = await prisma.featuredArtist.create({
    data: { displayName: `${prefix}featured`, releaseId: releaseOf.deleted },
    select: { id: true },
  }));

  seeded.deleted = await seededRowsOf(releaseOf.deleted);
  seeded.sibling = await seededRowsOf(releaseOf.sibling);
  seeded.failed = await seededRowsOf(releaseOf.failed);

  outcome.deleted = await errorOf(async () => {
    deletedView = await ReleaseRepository.delete(releaseOf.deleted);
  });

  // Wrap the real `$transaction` once, so the rollback is MongoDB's own.
  const transaction = prisma.$transaction.bind(prisma);
  const failing = vi
    .spyOn(prisma, '$transaction')
    .mockImplementationOnce(((run: (tx: TransactionClient) => Promise<unknown>) =>
      transaction((tx) => run(withFailingReleaseDelete(tx)))) as typeof prisma.$transaction);
  outcome.failed = await errorOf(() => ReleaseRepository.delete(releaseOf.failed));
  failing.mockRestore();

  outcome.missing = await errorOf(() => ReleaseRepository.delete(randomBytes(12).toString('hex')));

  remaining.deleted = await rowsOf(prisma, releaseOf.deleted, seeded.deleted.formats);
  remaining.sibling = await rowsOf(prisma, releaseOf.sibling, seeded.sibling.formats);
  remaining.failed = await rowsOf(prisma, releaseOf.failed, seeded.failed.formats);
});

afterAll(async () => {
  const formatIds = sortedIds(
    await prisma.releaseDigitalFormat.findMany({
      where: { releaseId: { in: releaseIds } },
      select: { id: true },
    })
  );
  const byRelease = { where: { releaseId: { in: releaseIds } } };
  await prisma.releaseDigitalFormatFile.deleteMany({ where: { formatId: { in: formatIds } } });
  await prisma.releaseDigitalFormat.deleteMany(byRelease);
  await prisma.releasePurchase.deleteMany(byRelease);
  await prisma.releaseDownload.deleteMany(byRelease);
  await prisma.downloadEvent.deleteMany(byRelease);
  await prisma.releaseUrl.deleteMany(byRelease);
  await prisma.url.deleteMany({ where: { url: { startsWith: prefix } } });
  await prisma.image.deleteMany(byRelease);
  await prisma.artistRelease.deleteMany(byRelease);
  await prisma.featuredArtist.deleteMany({ where: { displayName: { startsWith: prefix } } });
  await prisma.release.deleteMany({ where: { id: { in: releaseIds } } });
  await prisma.artist.deleteMany({ where: { id: { in: artistIds } } });
  await prisma.user.deleteMany({ where: { email: { startsWith: prefix } } });
  await prisma.$disconnect();
});

describe('a release delete (Docker Mongo contract)', () => {
  it('is run on releases seeded with every kind of row', () => {
    const counts = (rows: ReleaseRows) =>
      Object.fromEntries(Object.entries(rows).map(([kind, ids]) => [kind, ids.length]));

    expect([counts(seeded.deleted), counts(seeded.sibling), counts(seeded.failed)]).toEqual([
      SEEDED_COUNTS,
      SEEDED_COUNTS,
      SEEDED_COUNTS,
    ]);
  });

  describe('that goes through', () => {
    it('removes the release and every row keyed to its id', () => {
      const { files: _files, ...keyed } = remaining.deleted;

      expect({ outcome: outcome.deleted, keyed }).toEqual({
        outcome: null,
        keyed: {
          release: [],
          formats: [],
          purchases: [],
          downloads: [],
          events: [],
          releaseUrls: [],
          images: [],
          credits: [],
        },
      });
    });

    it("removes its formats' files", () => {
      expect(remaining.deleted.files).toEqual([]);
    });

    it('keeps the credited artists, and the featured artist without the release', async () => {
      const artists = await prisma.artist.count({ where: { id: { in: artistIds } } });
      const featured = await prisma.featuredArtist.findUnique({
        where: { id: featuredArtistId },
        select: { releaseId: true },
      });

      expect({ artists, featured }).toEqual({ artists: 2, featured: { releaseId: null } });
    });

    it('leaves every row of a sibling release in place', () => {
      expect(remaining.sibling).toEqual(seeded.sibling);
    });

    it("returns its files' S3 keys and its images", () => {
      expect({
        s3Keys: deletedView?.digitalFormats
          .flatMap(({ files }) => files.map(({ s3Key }) => s3Key))
          .sort(),
        images: deletedView?.images.map(({ id }) => id).sort(),
      }).toEqual({
        s3Keys: FORMAT_TYPES.flatMap((formatType) =>
          TRACK_NUMBERS.map((trackNumber) => s3KeyOf('deleted', formatType, trackNumber))
        ).sort(),
        images: seeded.deleted.images,
      });
    });
  });

  describe('that fails at its final step', () => {
    it('rejects with that failure after every child step has written', () => {
      expect({
        cause: outcome.failed instanceof DataError ? outcome.failed.cause : outcome.failed,
        seenAtFailure,
      }).toEqual({
        cause: INJECTED,
        seenAtFailure: { ...noRows(), release: seeded.failed.release },
      });
    });

    it('leaves every row of the release as it was seeded', () => {
      expect(remaining.failed).toEqual(seeded.failed);
    });
  });

  describe('of a well-formed id that names no release', () => {
    it('rejects with a NOT_FOUND DataError', () => {
      expect(outcome.missing).toBeInstanceOf(DataError);
      expect(outcome.missing).toMatchObject({ code: 'NOT_FOUND' });
    });
  });
});
