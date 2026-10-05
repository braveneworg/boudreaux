/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { randomUUID } from 'node:crypto';

import { prisma } from '@/lib/prisma';
import type { PublishedWorkCreditedTo } from '@/lib/utils/credit-confirmation';

import { ArtistCreditRepository } from './artist-credit-repository';

// Contract: on a real MongoDB, the published work listed before hiding an
// artist marks the releases the artist leads (its first credit in stored
// order) as left without a byline, and only those. Runs only under
// `pnpm run test:db`.

const prefix = `__contract:${randomUUID()}:`;
const PUBLISHED = new Date('2026-01-01T00:00:00.000Z');

const release = { led: '', guest: '' };
let artistId = '';
let work: PublishedWorkCreditedTo = { releases: [], tourDates: [] };

const createArtist = async (label: string): Promise<string> => {
  const { id } = await prisma.artist.create({
    data: { firstName: prefix, surname: label, slug: `${prefix}${label}`, publishedOn: PUBLISHED },
    select: { id: true },
  });
  return id;
};

const createRelease = async (label: string, credited: string[]): Promise<string> => {
  const { id } = await prisma.release.create({
    data: {
      title: `${prefix}${label}`,
      releasedOn: PUBLISHED,
      coverArt: 'https://cdn.example.com/contract.webp',
      publishedAt: PUBLISHED,
    },
    select: { id: true },
  });
  await prisma.artistRelease.createMany({
    data: credited.map((credited, position) => ({ artistId: credited, releaseId: id, position })),
  });
  return id;
};

// Every row is seeded, and the read is run, here: the tests run shuffled.
beforeAll(async () => {
  artistId = await createArtist('hidden-next');
  const other = await createArtist('other');
  release.led = await createRelease('led', [artistId, other]);
  release.guest = await createRelease('guest', [other, artistId]);
  work = await ArtistCreditRepository.findPublishedWorkCreditedTo(artistId);
});

afterAll(async () => {
  const releaseIds = Object.values(release);
  await prisma.artistRelease.deleteMany({ where: { releaseId: { in: releaseIds } } });
  await prisma.release.deleteMany({ where: { id: { in: releaseIds } } });
  await prisma.artist.deleteMany({ where: { slug: { startsWith: prefix } } });
  await prisma.$disconnect();
});

describe('published work before hiding an artist (Docker Mongo contract)', () => {
  it('marks the release the artist leads, and not the one it is a guest on', () => {
    const marks = Object.fromEntries(
      work.releases.map(({ id, leavesNoByline }) => [id, leavesNoByline])
    );

    expect(marks).toEqual({ [release.led]: true, [release.guest]: false });
  });
});
