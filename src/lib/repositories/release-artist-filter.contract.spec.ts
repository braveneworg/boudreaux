/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { randomUUID } from 'node:crypto';

import { prisma } from '@/lib/prisma';

import { ReleaseRepository } from './release-repository';

// Contract: on a real MongoDB, the public listing filtered by an artist slug
// holds every listed release the artist holds a release credit on (ADR-0006):
// their own, their featured appearances, and the releases of every public
// band they belong to. A hidden band's releases, a soft-deleted release and a
// hidden artist's slug match nothing. Runs only under `pnpm run test:db`.

const prefix = `__contract:${randomUUID()}:`;
const PUBLISHED = new Date('2026-01-01T00:00:00.000Z');
const visible = { publishedOn: PUBLISHED };
const listed = { publishedAt: PUBLISHED };

const release = {
  own: '',
  featured: '',
  publicBand: '',
  hiddenBand: '',
  unrelated: '',
  draftBand: '',
  hiddenMemberBand: '',
  publishedDeleted: '',
};
let memberSlugFound: string[] = [];
let hiddenSlugFound: string[] = [];
/** The release ids the deep-link read finds under the member's slug, of all seeded. */
let deepLinkFound: string[] = [];

const slugOf = (label: string): string => `${prefix}${label}`;

const createArtist = async (
  label: string,
  gate: { publishedOn?: Date; deletedOn?: Date }
): Promise<string> => {
  const { id } = await prisma.artist.create({
    data: { firstName: prefix, surname: label, slug: slugOf(label), ...gate },
    select: { id: true },
  });
  return id;
};

const createRelease = async (
  label: string,
  credited: string[],
  state: { publishedAt?: Date; deletedOn?: Date }
): Promise<string> => {
  const { id } = await prisma.release.create({
    data: {
      title: `${prefix}${label}`,
      releasedOn: PUBLISHED,
      coverArt: 'https://cdn.example.com/contract.webp',
      ...state,
    },
    select: { id: true },
  });
  await prisma.artistRelease.createMany({
    data: credited.map((artistId, position) => ({ artistId, releaseId: id, position })),
  });
  return id;
};

const findIds = async (artist: string): Promise<string[]> => {
  const ours = new Set(Object.values(release));
  const rows = await ReleaseRepository.findPublished({ skip: 0, take: 100, artist });
  return rows.map(({ id }) => id).filter((id) => ours.has(id));
};

// Every row is seeded, and the reads are run, here: the tests run shuffled.
beforeAll(async () => {
  const member = await createArtist('member', visible);
  const other = await createArtist('other', visible);
  const band = await createArtist('band', visible);
  const hiddenBand = await createArtist('hidden-band', {});
  const hiddenMember = await createArtist('hidden-member', {});

  await prisma.artistMember.createMany({
    data: [
      { artistId: band, memberId: member },
      { artistId: hiddenBand, memberId: member },
      { artistId: band, memberId: hiddenMember },
    ],
  });

  release.own = await createRelease('own', [member, other], listed);
  release.featured = await createRelease('featured', [other, member], listed);
  release.publicBand = await createRelease('public-band', [band], listed);
  release.hiddenBand = await createRelease('hidden-band', [hiddenBand], listed);
  release.unrelated = await createRelease('unrelated', [other], listed);
  release.draftBand = await createRelease('draft-band', [band], {});
  release.hiddenMemberBand = await createRelease('hidden-member-band', [other, band], listed);
  // Published, then soft-deleted: not a listed release, though the member holds its credit.
  release.publishedDeleted = await createRelease('published-deleted', [member], {
    ...listed,
    deletedOn: PUBLISHED,
  });

  memberSlugFound = await findIds(slugOf('member'));
  hiddenSlugFound = await findIds(slugOf('hidden-member'));
  const reads = await Promise.all(
    Object.values(release).map((id) =>
      ReleaseRepository.findPublishedWithTracks(id, slugOf('member'))
    )
  );
  deepLinkFound = reads.flatMap((row) => (row ? [row.id] : []));
});

afterAll(async () => {
  const releaseIds = Object.values(release);
  const artists = await prisma.artist.findMany({
    where: { slug: { startsWith: prefix } },
    select: { id: true },
  });
  const artistIds = artists.map(({ id }) => id);
  await prisma.artistMember.deleteMany({ where: { artistId: { in: artistIds } } });
  await prisma.artistRelease.deleteMany({ where: { releaseId: { in: releaseIds } } });
  await prisma.release.deleteMany({ where: { id: { in: releaseIds } } });
  await prisma.artist.deleteMany({ where: { id: { in: artistIds } } });
  await prisma.$disconnect();
});

describe('published releases filtered by artist (Docker Mongo contract)', () => {
  it('holds the own, featured and public-band releases of the artist', () => {
    expect([...memberSlugFound].sort()).toEqual(
      [release.own, release.featured, release.publicBand, release.hiddenMemberBand].sort()
    );
  });

  it('leaves out the releases of a hidden band the artist belongs to', () => {
    expect(memberSlugFound).not.toContain(release.hiddenBand);
  });

  it('leaves out a draft band release', () => {
    expect(memberSlugFound).not.toContain(release.draftBand);
  });

  it('leaves out a published release that is soft-deleted', () => {
    expect(memberSlugFound).not.toContain(release.publishedDeleted);
  });

  it('never deep-links a published release that is soft-deleted', () => {
    expect(deepLinkFound).not.toContain(release.publishedDeleted);
  });

  it('matches nothing for a hidden artist, band releases included', () => {
    expect(hiddenSlugFound).toEqual([]);
  });

  it('finds a deep-linked release under the same credit rule as the listing', () => {
    expect([...deepLinkFound].sort()).toEqual([...memberSlugFound].sort());
  });
});
