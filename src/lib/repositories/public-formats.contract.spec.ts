/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { randomUUID } from 'node:crypto';

import { prisma } from '@/lib/prisma';

import { ArtistRepository } from './artist-repository';
import { ReleaseRepository } from './release-repository';

// Contract: a public read of a release carries only the format the public
// players play — the active MP3_320KBPS format — never a paid format and
// never a withdrawn one. Until 2026-10-04 the release page and the artist
// page loaded every format with every file, and every non-MP3 file was
// signed into a 24-hour CloudFront URL in an anonymous, shared-cached
// payload. Runs only under `pnpm run test:db`. Every row is seeded here
// (tests run shuffled).

const prefix = `__contract:${randomUUID()}:`;
const PUBLISHED = new Date('2026-01-01T00:00:00.000Z');
const WITHDRAWN = new Date('2026-02-01T00:00:00.000Z');

let artistId = '';
/** Active MP3 + active FLAC + withdrawn WAV: only the MP3 is playable. */
let mixedReleaseId = '';
/** Withdrawn MP3 + active FLAC: nothing is playable. */
let unplayableReleaseId = '';

const createRelease = async (label: string): Promise<string> => {
  const release = await prisma.release.create({
    data: {
      title: `${prefix}${label}`,
      releasedOn: PUBLISHED,
      publishedAt: PUBLISHED,
      coverArt: 'https://cdn.example.com/contract.webp',
    },
    select: { id: true },
  });
  return release.id;
};

const createFormat = async (
  releaseId: string,
  formatType: string,
  deletedAt: Date | null = null
): Promise<void> => {
  await prisma.releaseDigitalFormat.create({
    data: {
      releaseId,
      formatType,
      ...(deletedAt && { deletedAt }),
      files: {
        create: [1, 2].map((trackNumber) => ({
          trackNumber,
          s3Key: `releases/${releaseId}/digital-formats/${formatType}/${trackNumber}`,
          fileName: `${trackNumber}.bin`,
          fileSize: BigInt(1),
          mimeType: 'application/octet-stream',
        })),
      },
    },
  });
};

beforeAll(async () => {
  const artist = await prisma.artist.create({
    data: {
      firstName: prefix,
      surname: 'artist',
      slug: `${prefix}artist`,
      publishedOn: PUBLISHED,
    },
    select: { id: true },
  });
  artistId = artist.id;

  mixedReleaseId = await createRelease('mixed');
  await createFormat(mixedReleaseId, 'MP3_320KBPS');
  await createFormat(mixedReleaseId, 'FLAC');
  await createFormat(mixedReleaseId, 'WAV', WITHDRAWN);

  unplayableReleaseId = await createRelease('unplayable');
  await createFormat(unplayableReleaseId, 'MP3_320KBPS', WITHDRAWN);
  await createFormat(unplayableReleaseId, 'FLAC');

  await prisma.artistRelease.createMany({
    data: [mixedReleaseId, unplayableReleaseId].map((releaseId) => ({
      artistId,
      releaseId,
      position: 0,
    })),
  });
});

afterAll(async () => {
  const releaseIds = [mixedReleaseId, unplayableReleaseId];
  await prisma.artistRelease.deleteMany({ where: { releaseId: { in: releaseIds } } });
  await prisma.releaseDigitalFormatFile.deleteMany({
    where: { format: { releaseId: { in: releaseIds } } },
  });
  await prisma.releaseDigitalFormat.deleteMany({ where: { releaseId: { in: releaseIds } } });
  await prisma.release.deleteMany({ where: { id: { in: releaseIds } } });
  await prisma.artist.delete({ where: { id: artistId } });
  await prisma.$disconnect();
});

const formatTypesOf = (formats: { formatType?: string }[] | undefined): (string | undefined)[] =>
  (formats ?? []).map(({ formatType }) => formatType);

describe('public release reads carry only the playable format (Docker Mongo contract)', () => {
  it('the release page read returns the active MP3 format and its files only', async () => {
    const release = await ReleaseRepository.findPublishedWithTracks(mixedReleaseId);

    expect(formatTypesOf(release?.digitalFormats)).toEqual(['MP3_320KBPS']);
    expect(release?.digitalFormats[0]?.files.map(({ trackNumber }) => trackNumber)).toEqual([1, 2]);
  });

  it('the release page read returns no format when the MP3 is withdrawn', async () => {
    const release = await ReleaseRepository.findPublishedWithTracks(unplayableReleaseId);

    expect(release?.digitalFormats).toEqual([]);
  });

  it('the artist page read returns only the active MP3 format of each release', async () => {
    const artist = await ArtistRepository.findPublishedBySlugWithReleases(`${prefix}artist`);

    const byRelease = new Map(
      (artist?.releases ?? []).map(({ release }) => [
        release.id,
        formatTypesOf(release.digitalFormats),
      ])
    );
    expect(byRelease.get(mixedReleaseId)).toEqual(['MP3_320KBPS']);
    expect(byRelease.get(unplayableReleaseId)).toEqual([]);
  });
});
