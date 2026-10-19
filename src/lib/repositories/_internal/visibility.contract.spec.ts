/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { randomUUID } from 'node:crypto';

import { prisma } from '@/lib/prisma';

import { listedRelease, publicArtist } from './visibility';

import type { Prisma } from '@prisma/client';

// Contract: on a real MongoDB, each visibility rule's `where` matches exactly
// the rows the rule says, its predicate agrees with the `where` on the rows
// Prisma hands back, and the `where` keeps working beside a caller's own
// `OR`. Each field a rule reads takes all three ways a nullable field can be
// stored: absent, explicit null, set. Runs only under `pnpm run test:db`.

/** How a nullable DateTime is written into the seeded document. */
type Storage = 'absent' | 'null' | 'set';

const STORAGES: Storage[] = ['absent', 'null', 'set'];
const SET_AT = new Date('2026-01-01T00:00:00.000Z');

const dateFor = (storage: Storage): Date | null | undefined =>
  storage === 'set' ? SET_AT : storage === 'null' ? null : undefined;

/** A seeded row, keyed by how its publication field and `deletedOn` were stored. */
interface SeededRow {
  key: string;
  published: Storage;
  deletedOn: Storage;
}

/** One row per storage pair of a rule's two fields. */
const rowsFor = (publicationField: string): SeededRow[] =>
  STORAGES.flatMap((published) =>
    STORAGES.map((deletedOn) => ({
      key: `${publicationField}=${published} deletedOn=${deletedOn}`,
      published,
      deletedOn,
    }))
  );

const keysWhere = (rows: SeededRow[], predicate: (row: SeededRow) => boolean): string[] =>
  rows
    .filter(predicate)
    .map(({ key }) => key)
    .sort();

/** Both rules ask for the same states: published, and not deleted. */
const isVisible = ({ published, deletedOn }: SeededRow): boolean =>
  published === 'set' && deletedOn !== 'set';

const prefix = `__contract:${randomUUID()}:`;
const releasePrefix = `${prefix}release:`;
const artistScope = { slug: { startsWith: prefix } } satisfies Prisma.ArtistWhereInput;
// The release every artist is credited on is named outside this scope, so it
// is never one of the seeded releases.
const releaseScope = { title: { startsWith: releasePrefix } } satisfies Prisma.ReleaseWhereInput;

const artists = rowsFor('publishedOn');
const releases = rowsFor('publishedAt');
let creditedReleaseId = '';

const artistKeys = (found: Array<{ slug: string }>): string[] =>
  found.map(({ slug }) => slug.slice(prefix.length)).sort();

const releaseKeys = (found: Array<{ title: string }>): string[] =>
  found.map(({ title }) => title.slice(releasePrefix.length)).sort();

const findArtistKeys = async (where: Prisma.ArtistWhereInput): Promise<string[]> =>
  artistKeys(
    await prisma.artist.findMany({
      where: { ...artistScope, AND: [where] },
      select: { slug: true },
    })
  );

const findReleaseKeys = async (where: Prisma.ReleaseWhereInput): Promise<string[]> =>
  releaseKeys(
    await prisma.release.findMany({
      where: { ...releaseScope, AND: [where] },
      select: { title: true },
    })
  );

// Every row is seeded here, serially: the tests run shuffled, concurrent first
// writes to a fresh collection race Prisma's post-insert read-back, and an
// omitted field must be genuinely absent from the document.
beforeAll(async () => {
  const credited = await prisma.release.create({
    data: {
      title: `${prefix}credited`,
      releasedOn: SET_AT,
      coverArt: 'https://cdn.example.com/contract.webp',
      publishedAt: SET_AT,
    },
    select: { id: true },
  });
  creditedReleaseId = credited.id;

  for (const artist of artists) {
    await prisma.artist.create({
      data: {
        firstName: 'Contract',
        surname: artist.key,
        slug: `${prefix}${artist.key}`,
        publishedOn: dateFor(artist.published),
        deletedOn: dateFor(artist.deletedOn),
        releases: { create: { releaseId: creditedReleaseId } },
      },
    });
  }

  for (const release of releases) {
    await prisma.release.create({
      data: {
        title: `${releasePrefix}${release.key}`,
        releasedOn: SET_AT,
        coverArt: 'https://cdn.example.com/contract.webp',
        publishedAt: dateFor(release.published),
        deletedOn: dateFor(release.deletedOn),
      },
    });
  }
});

afterAll(async () => {
  await prisma.artistRelease.deleteMany({ where: { releaseId: creditedReleaseId } });
  await prisma.artist.deleteMany({ where: artistScope });
  await prisma.release.deleteMany({ where: { title: { startsWith: prefix } } });
  await prisma.$disconnect();
});

describe('publicArtist (Docker Mongo contract)', () => {
  it('where matches published artists that are not deleted, however each field is stored', async () => {
    expect(await findArtistKeys(publicArtist.where)).toEqual(keysWhere(artists, isVisible));
  });

  it('matches agrees with where on the rows Prisma hands back', async () => {
    // Prisma hands an absent field back as null, so the predicate sees two
    // storages where the database sees three.
    const all = await prisma.artist.findMany({
      where: artistScope,
      select: { slug: true, publishedOn: true, deletedOn: true },
    });

    expect(artistKeys(all.filter(publicArtist.matches))).toEqual(
      await findArtistKeys(publicArtist.where)
    );
  });

  it('where composes with a caller-supplied OR without the two colliding', async () => {
    const withOr = {
      ...publicArtist.where,
      OR: [{ slug: { contains: 'deletedOn=absent' } }, { slug: { contains: 'deletedOn=set' } }],
    };

    expect(await findArtistKeys(withOr)).toEqual(
      keysWhere(
        artists,
        ({ published, deletedOn }) => published === 'set' && deletedOn === 'absent'
      )
    );
  });

  it('where nested on a credit as `artist: { is: … }` matches the same artists', async () => {
    const credits = await prisma.artistRelease.findMany({
      where: { releaseId: creditedReleaseId, artist: { is: publicArtist.where } },
      select: { artist: { select: { slug: true } } },
    });

    expect(artistKeys(credits.map(({ artist }) => artist))).toEqual(keysWhere(artists, isVisible));
  });
});

describe('listedRelease (Docker Mongo contract)', () => {
  it('where matches published releases that are not deleted, however each field is stored', async () => {
    expect(await findReleaseKeys(listedRelease.where)).toEqual(keysWhere(releases, isVisible));
  });

  it('matches agrees with where on the rows Prisma hands back', async () => {
    // Prisma hands an absent field back as null, so the predicate sees two
    // storages where the database sees three.
    const all = await prisma.release.findMany({
      where: releaseScope,
      select: { title: true, publishedAt: true, deletedOn: true },
    });

    expect(releaseKeys(all.filter(listedRelease.matches))).toEqual(
      await findReleaseKeys(listedRelease.where)
    );
  });

  it('where composes with a caller-supplied OR without the two colliding', async () => {
    const withOr = {
      ...listedRelease.where,
      OR: [{ title: { contains: 'deletedOn=absent' } }, { title: { contains: 'deletedOn=set' } }],
    };

    expect(await findReleaseKeys(withOr)).toEqual(
      keysWhere(
        releases,
        ({ published, deletedOn }) => published === 'set' && deletedOn === 'absent'
      )
    );
  });
});
