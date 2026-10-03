/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { randomUUID } from 'node:crypto';

import { prisma } from '@/lib/prisma';

import { creditOrderBy } from './_internal/credit-order';

// Contract: `ArtistRelease.position` on a real MongoDB. A credit row written
// before the field existed has no `position` at all; the deploy pushes the
// schema before the backfill runs, so every read in between must still work
// and must still return today's insertion order. Runs only under
// `pnpm run test:db`.

const prefix = `__contract:${randomUUID()}:`;
let legacyReleaseId = '';
let stampedReleaseId = '';
const artistIds: string[] = [];

const createArtist = async (label: string): Promise<string> => {
  const artist = await prisma.artist.create({
    data: { firstName: prefix, surname: label, slug: `${prefix}${label}` },
    select: { id: true },
  });
  artistIds.push(artist.id);
  return artist.id;
};

const createRelease = async (label: string): Promise<string> => {
  const release = await prisma.release.create({
    data: {
      title: `${prefix}${label}`,
      releasedOn: new Date('2026-01-01T00:00:00.000Z'),
      coverArt: 'https://cdn.example.com/contract.webp',
    },
    select: { id: true },
  });
  return release.id;
};

const surnamesOf = async (releaseId: string): Promise<string[]> => {
  const rows = await prisma.artistRelease.findMany({
    where: { releaseId },
    orderBy: creditOrderBy,
    select: { artist: { select: { surname: true } } },
  });
  return rows.map(({ artist }) => artist.surname);
};

// Every row is seeded here (tests run shuffled): a legacy release whose
// credits were written the way the pre-position code wrote them — one insert
// each, in order, no `position` field (Prisma would write the default, so the
// raw command keeps it genuinely absent) — and a stamped release whose
// positions reverse its insertion order.
beforeAll(async () => {
  legacyReleaseId = await createRelease('legacy');
  for (const label of ['first', 'second', 'third']) {
    const artistId = await createArtist(`legacy-${label}`);
    await prisma.$runCommandRaw({
      insert: 'ArtistRelease',
      documents: [{ artistId: { $oid: artistId }, releaseId: { $oid: legacyReleaseId } }],
    });
  }
  stampedReleaseId = await createRelease('stamped');
  for (const [label, position] of [
    ['first', 2],
    ['second', 1],
    ['third', 0],
  ] as const) {
    const artistId = await createArtist(`stamped-${label}`);
    await prisma.artistRelease.create({
      data: { artistId, releaseId: stampedReleaseId, position },
    });
  }
});

afterAll(async () => {
  await prisma.artistRelease.deleteMany({
    where: { releaseId: { in: [legacyReleaseId, stampedReleaseId] } },
  });
  await prisma.release.deleteMany({ where: { id: { in: [legacyReleaseId, stampedReleaseId] } } });
  await prisma.artist.deleteMany({ where: { id: { in: artistIds } } });
  await prisma.$disconnect();
});

describe('ArtistRelease.position (Docker Mongo contract)', () => {
  it('reads a row with no position field as 0 instead of failing', async () => {
    const rows = await prisma.artistRelease.findMany({ where: { releaseId: legacyReleaseId } });

    expect(rows.map(({ position }) => position)).toEqual([0, 0, 0]);
  });

  it('orders pre-backfill rows by id, which is the order they were written in', async () => {
    expect(await surnamesOf(legacyReleaseId)).toEqual([
      'legacy-first',
      'legacy-second',
      'legacy-third',
    ]);
  });

  it('orders by position once positions are stamped, whatever the insertion order', async () => {
    expect(await surnamesOf(stampedReleaseId)).toEqual([
      'stamped-third',
      'stamped-second',
      'stamped-first',
    ]);
  });
});
