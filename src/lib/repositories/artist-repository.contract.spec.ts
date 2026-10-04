/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { randomUUID } from 'node:crypto';

import { prisma } from '@/lib/prisma';

import { ArtistCreditRepository } from './artist-credit-repository';
import { ArtistRepository } from './artist-repository';
import { ReleaseRepository } from './release-repository';

// Contract: the artist page's read returns a release's credits in the stored
// credit order, whatever order the rows were inserted in — the read that the
// 2026-10-03 credit-order work left on Mongo's natural order — and crediting
// one more artist appends after the existing credits. Runs only under
// `pnpm run test:db`. Every row is seeded here (tests run shuffled).

const prefix = `__contract:${randomUUID()}:`;
const artistIds: string[] = [];
let releaseId = '';
let firstInsertedId = '';
let movedToFrontId = '';
let appendedId = '';

const createArtist = async (label: string): Promise<string> => {
  const artist = await prisma.artist.create({
    data: {
      firstName: prefix,
      surname: label,
      slug: `${prefix}${label}`,
      publishedOn: new Date('2026-01-01T00:00:00.000Z'),
    },
    select: { id: true },
  });
  artistIds.push(artist.id);
  return artist.id;
};

beforeAll(async () => {
  firstInsertedId = await createArtist('first-inserted');
  movedToFrontId = await createArtist('moved-to-front');
  appendedId = await createArtist('appended');
  const release = await prisma.release.create({
    data: {
      title: `${prefix}release`,
      releasedOn: new Date('2026-01-01T00:00:00.000Z'),
      publishedAt: new Date('2026-01-01T00:00:00.000Z'),
      coverArt: 'https://cdn.example.com/contract.webp',
    },
    select: { id: true },
  });
  releaseId = release.id;
  // Inserted first-inserted then moved-to-front; an admin then reorders so
  // moved-to-front is the album artist (positions change, ids do not).
  await prisma.artistRelease.createMany({
    data: [firstInsertedId, movedToFrontId].map((artistId, position) => ({
      artistId,
      releaseId,
      position,
    })),
  });
  await ReleaseRepository.updateWithCredits(
    releaseId,
    {},
    { artistIds: [movedToFrontId, firstInsertedId] }
  );
  await ArtistCreditRepository.creditOnRelease(releaseId, appendedId);
  await ArtistCreditRepository.creditOnRelease(releaseId, appendedId);
});

afterAll(async () => {
  await prisma.artistRelease.deleteMany({ where: { releaseId } });
  await prisma.release.delete({ where: { id: releaseId } });
  await prisma.artist.deleteMany({ where: { id: { in: artistIds } } });
  await prisma.$disconnect();
});

describe('ArtistRepository credit reads (Docker Mongo contract)', () => {
  it('reads the artist page release credits in the stored order, not insertion order', async () => {
    const artist = await ArtistRepository.findPublishedBySlugWithReleases(
      `${prefix}first-inserted`
    );

    const credits = artist?.releases[0]?.release.artistReleases.map(({ artistId }) => artistId);
    expect(credits).toEqual([movedToFrontId, firstInsertedId, appendedId]);
  });

  it('credits one more artist after the existing credits, once', async () => {
    const rows = await prisma.artistRelease.findMany({
      where: { releaseId, artistId: appendedId },
      select: { position: true },
    });

    expect(rows).toEqual([{ position: 2 }]);
  });
});
