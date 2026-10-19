/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { randomUUID } from 'node:crypto';

import { prisma } from '@/lib/prisma';
import { DataError } from '@/lib/types/domain/errors';

import { ReleaseDigitalFormatRepository } from './release-digital-format-repository';

// Contract: a track replacement is one transaction. It writes the parent, the
// tracks and the cached counts together, and a replacement that fails part-way
// keeps the previous tracks and counts — the unit spec's mocked `$transaction`
// cannot show a rollback. Runs only under `pnpm run test:db`. Every row is
// seeded here (tests run shuffled); each case owns its own Release.

const prefix = `__contract:${randomUUID()}:`;
const RELEASED = new Date('2026-01-01T00:00:00.000Z');
const WITHDRAWN = new Date('2026-02-01T00:00:00.000Z');

const repository = new ReleaseDigitalFormatRepository();

/** A Release with no format yet. */
let freshReleaseId = '';
/** A Release whose FLAC format is withdrawn and holds two tracks. */
let withdrawnReleaseId = '';
/** A Release whose FLAC format holds two tracks and their counts. */
let keptReleaseId = '';

const createRelease = async (label: string): Promise<string> => {
  const release = await prisma.release.create({
    data: {
      title: `${prefix}${label}`,
      releasedOn: RELEASED,
      coverArt: 'https://cdn.example.com/contract.webp',
    },
    select: { id: true },
  });
  return release.id;
};

const keyOf = (releaseId: string, name: string): string =>
  `releases/${releaseId}/digital-formats/FLAC/${name}`;

const createFlacWithTwoTracks = async (releaseId: string, deletedAt?: Date): Promise<void> => {
  await prisma.releaseDigitalFormat.create({
    data: {
      releaseId,
      formatType: 'FLAC',
      trackCount: 2,
      totalFileSize: BigInt(30),
      ...(deletedAt && { deletedAt }),
      files: {
        create: [1, 2].map((trackNumber) => ({
          trackNumber,
          s3Key: keyOf(releaseId, `old-${trackNumber}.flac`),
          fileName: `old-${trackNumber}.flac`,
          fileSize: BigInt(trackNumber * 10),
          mimeType: 'audio/flac',
        })),
      },
    },
  });
};

const track = (releaseId: string, trackNumber: number, name: string) => ({
  trackNumber,
  s3Key: keyOf(releaseId, name),
  fileName: name,
  fileSize: BigInt(100),
  mimeType: 'audio/flac',
});

const readFlac = (releaseId: string) =>
  prisma.releaseDigitalFormat.findUnique({
    where: { releaseId_formatType: { releaseId, formatType: 'FLAC' } },
    include: { files: { orderBy: { trackNumber: 'asc' } } },
  });

beforeAll(async () => {
  // The schema declares both unique indexes; a scratch database only has
  // them once something creates them. The rollback case depends on the
  // track-number index, so create both here rather than rely on a prior
  // `prisma db push`.
  await prisma.$runCommandRaw({
    createIndexes: 'ReleaseDigitalFormat',
    indexes: [
      {
        key: { releaseId: 1, formatType: 1 },
        name: 'ReleaseDigitalFormat_releaseId_formatType_key',
        unique: true,
      },
    ],
  });
  await prisma.$runCommandRaw({
    createIndexes: 'ReleaseDigitalFormatFile',
    indexes: [
      {
        key: { formatId: 1, trackNumber: 1 },
        name: 'ReleaseDigitalFormatFile_formatId_trackNumber_key',
        unique: true,
      },
    ],
  });

  freshReleaseId = await createRelease('fresh');
  withdrawnReleaseId = await createRelease('withdrawn');
  await createFlacWithTwoTracks(withdrawnReleaseId, WITHDRAWN);
  keptReleaseId = await createRelease('kept');
  await createFlacWithTwoTracks(keptReleaseId);
});

afterAll(async () => {
  const releaseIds = [freshReleaseId, withdrawnReleaseId, keptReleaseId];
  await prisma.releaseDigitalFormatFile.deleteMany({
    where: { format: { releaseId: { in: releaseIds } } },
  });
  await prisma.releaseDigitalFormat.deleteMany({ where: { releaseId: { in: releaseIds } } });
  await prisma.release.deleteMany({ where: { id: { in: releaseIds } } });
  await prisma.$disconnect();
});

describe('track replacement is one transaction (Docker Mongo contract)', () => {
  it('a replacement writes the parent, the tracks and the counts', async () => {
    const result = await repository.replaceTracks(freshReleaseId, 'FLAC', [
      track(freshReleaseId, 1, 'one.flac'),
      track(freshReleaseId, 2, 'two.flac'),
    ]);

    const format = await readFlac(freshReleaseId);
    expect(result).toEqual({ formatId: format?.id, fileCount: 2, replacedKeys: [] });
    expect(format?.trackCount).toBe(2);
    expect(format?.totalFileSize).toBe(BigInt(200));
    expect(format?.files.map(({ s3Key }) => s3Key)).toEqual([
      keyOf(freshReleaseId, 'one.flac'),
      keyOf(freshReleaseId, 'two.flac'),
    ]);
  });

  it('a replacement restores a withdrawn format and reports the keys it replaced', async () => {
    const result = await repository.replaceTracks(withdrawnReleaseId, 'FLAC', [
      track(withdrawnReleaseId, 1, 'new.flac'),
    ]);

    const format = await readFlac(withdrawnReleaseId);
    expect(result.replacedKeys.sort()).toEqual([
      keyOf(withdrawnReleaseId, 'old-1.flac'),
      keyOf(withdrawnReleaseId, 'old-2.flac'),
    ]);
    expect(format?.deletedAt).toBeNull();
    expect(format?.files.map(({ s3Key }) => s3Key)).toEqual([
      keyOf(withdrawnReleaseId, 'new.flac'),
    ]);
    expect(format?.trackCount).toBe(1);
  });

  it('a replacement that fails part-way leaves the previous tracks and counts unchanged', async () => {
    const replacement = repository.replaceTracks(keptReleaseId, 'FLAC', [
      track(keptReleaseId, 1, 'clash-a.flac'),
      track(keptReleaseId, 1, 'clash-b.flac'),
    ]);

    await expect(replacement).rejects.toBeInstanceOf(DataError);
    const format = await readFlac(keptReleaseId);
    expect(format?.files.map(({ s3Key }) => s3Key)).toEqual([
      keyOf(keptReleaseId, 'old-1.flac'),
      keyOf(keptReleaseId, 'old-2.flac'),
    ]);
    expect(format?.trackCount).toBe(2);
    expect(format?.totalFileSize).toBe(BigInt(30));
  });
});
