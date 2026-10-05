/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { randomUUID } from 'node:crypto';

import { prisma } from '@/lib/prisma';

import { creditOrderBy } from './_internal/credit-order';
import { ArtistCreditRepository } from './artist-credit-repository';
import { ArtistRepository } from './artist-repository';

// Contract: on a real MongoDB, an artist's publisher is recorded only on the
// write that first publishes it; the album-artist read finds the releases
// an artist is first credit on; and a hard delete leaves the remaining
// credits of each release numbered 0..n-1. Runs only under `pnpm run test:db`.

const prefix = `__contract:${randomUUID()}:`;
const NOW = new Date('2026-10-04T12:00:00.000Z');
const EARLIER = new Date('2026-01-01T00:00:00.000Z');

const artist = { unpublished: '', published: '', lead: '', middle: '', tail: '' };
const release = { three: '', middleLeads: '' };
const read: Record<'ledByMiddle' | 'ledByTail', Array<{ id: string; title: string }>> = {
  ledByMiddle: [],
  ledByTail: [],
};

const createArtist = async (
  label: string,
  published?: { publishedOn: Date; publishedBy: string }
): Promise<string> => {
  const { id } = await prisma.artist.create({
    data: { firstName: prefix, surname: label, slug: `${prefix}${label}`, ...published },
    select: { id: true },
  });
  return id;
};

const createCreditedRelease = async (label: string, credited: string[]): Promise<string> => {
  const { id } = await prisma.release.create({
    data: {
      title: `${prefix}${label}`,
      releasedOn: EARLIER,
      coverArt: 'https://cdn.example.com/contract.webp',
    },
    select: { id: true },
  });
  await prisma.artistRelease.createMany({
    data: credited.map((artistId, position) => ({ artistId, releaseId: id, position })),
  });
  return id;
};

const publisherOf = (id: string) =>
  prisma.artist.findUniqueOrThrow({
    where: { id },
    select: { publishedOn: true, publishedBy: true },
  });

// Every row is seeded, and every write is run, here: the tests run shuffled
// and only read.
beforeAll(async () => {
  artist.unpublished = await createArtist('unpublished');
  artist.published = await createArtist('published', {
    publishedOn: EARLIER,
    publishedBy: 'earlier-admin',
  });
  artist.lead = await createArtist('lead');
  artist.middle = await createArtist('middle');
  artist.tail = await createArtist('tail');
  release.three = await createCreditedRelease('three', [artist.lead, artist.middle, artist.tail]);
  release.middleLeads = await createCreditedRelease('middle-leads', [artist.middle]);

  await ArtistRepository.update(
    artist.unpublished,
    { publishedOn: NOW },
    { publishedBy: 'admin-1' }
  );
  await ArtistRepository.update(artist.published, { publishedOn: NOW }, { publishedBy: 'admin-1' });
  read.ledByMiddle = await ArtistCreditRepository.findReleasesLedBy(artist.middle);
  read.ledByTail = await ArtistCreditRepository.findReleasesLedBy(artist.tail);
  await ArtistRepository.delete(artist.middle);
});

afterAll(async () => {
  const releaseIds = Object.values(release);
  await prisma.artistRelease.deleteMany({ where: { releaseId: { in: releaseIds } } });
  await prisma.release.deleteMany({ where: { id: { in: releaseIds } } });
  await prisma.artist.deleteMany({ where: { slug: { startsWith: prefix } } });
  await prisma.$disconnect();
});

describe('artist publish and delete (Docker Mongo contract)', () => {
  it('records the admin on the write that first publishes the artist', async () => {
    expect(await publisherOf(artist.unpublished)).toEqual({
      publishedOn: NOW,
      publishedBy: 'admin-1',
    });
  });

  it('keeps the first publisher when a public artist is saved again', async () => {
    expect((await publisherOf(artist.published)).publishedBy).toBe('earlier-admin');
  });

  it('finds the releases an artist is first credit on, and only those', () => {
    expect({ middle: read.ledByMiddle, tail: read.ledByTail }).toEqual({
      middle: [{ id: release.middleLeads, title: `${prefix}middle-leads` }],
      tail: [],
    });
  });

  it("renumbers a release's remaining credits 0..n-1 after a hard delete", async () => {
    const rows = await prisma.artistRelease.findMany({
      where: { releaseId: release.three },
      orderBy: creditOrderBy,
      select: { artistId: true, position: true },
    });

    expect(rows).toEqual([
      { artistId: artist.lead, position: 0 },
      { artistId: artist.tail, position: 1 },
    ]);
  });
});
