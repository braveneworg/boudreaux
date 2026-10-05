/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { randomUUID } from 'node:crypto';

import { prisma } from '@/lib/prisma';

import { ReleaseRepository } from './release-repository';

// Contract: on a real MongoDB, the releases whose byline names nobody are the
// listed (published, not deleted) releases whose first credit in stored
// order is a hidden artist, or that credit nobody (ADR-0015). A public
// second credit does not stand in for a hidden first one. Runs only under
// `pnpm run test:db`.

const prefix = `__contract:${randomUUID()}:`;
const PUBLISHED = new Date('2026-01-01T00:00:00.000Z');

const release = {
  publicLead: '',
  archivedLead: '',
  unpublishedLead: '',
  noCredits: '',
  draftHiddenLead: '',
  deletedHiddenLead: '',
};
let found: string[] = [];

const createArtist = async (
  label: string,
  gate: { publishedOn?: Date; deletedOn?: Date }
): Promise<string> => {
  const { id } = await prisma.artist.create({
    data: { firstName: prefix, surname: label, slug: `${prefix}${label}`, ...gate },
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
  if (credited.length > 0) {
    await prisma.artistRelease.createMany({
      data: credited.map((artistId, position) => ({ artistId, releaseId: id, position })),
    });
  }
  return id;
};

// Every row is seeded, and the read is run, here: the tests run shuffled.
beforeAll(async () => {
  const publicArtist = await createArtist('public', { publishedOn: PUBLISHED });
  const archived = await createArtist('archived', { publishedOn: PUBLISHED, deletedOn: PUBLISHED });
  const unpublished = await createArtist('unpublished', {});
  const listed = { publishedAt: PUBLISHED };

  release.publicLead = await createRelease('public-lead', [publicArtist, archived], listed);
  release.archivedLead = await createRelease('archived-lead', [archived, publicArtist], listed);
  release.unpublishedLead = await createRelease('unpublished-lead', [unpublished], listed);
  release.noCredits = await createRelease('no-credits', [], listed);
  release.draftHiddenLead = await createRelease('draft', [archived], {});
  release.deletedHiddenLead = await createRelease('deleted', [archived], {
    publishedAt: PUBLISHED,
    deletedOn: PUBLISHED,
  });

  const ours = new Set(Object.values(release));
  found = (await ReleaseRepository.findIdsWithoutByline()).filter((id) => ours.has(id));
});

afterAll(async () => {
  const releaseIds = Object.values(release);
  await prisma.artistRelease.deleteMany({ where: { releaseId: { in: releaseIds } } });
  await prisma.release.deleteMany({ where: { id: { in: releaseIds } } });
  await prisma.artist.deleteMany({ where: { slug: { startsWith: prefix } } });
  await prisma.$disconnect();
});

describe('releases without a byline (Docker Mongo contract)', () => {
  it('are the listed releases whose first credit is hidden, or that credit nobody', () => {
    expect([...found].sort()).toEqual(
      [release.archivedLead, release.unpublishedLead, release.noCredits].sort()
    );
  });

  it('leave out a release whose first credit is public, whatever follows it', () => {
    expect(found).not.toContain(release.publicLead);
  });

  it('leave out drafts and deleted releases', () => {
    expect(
      found.filter((id) => id === release.draftHiddenLead || id === release.deletedHiddenLead)
    ).toEqual([]);
  });
});
