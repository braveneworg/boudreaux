/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { randomUUID } from 'node:crypto';

import { prisma } from '@/lib/prisma';

import {
  artistWhere,
  creditAwaitingConfirmationWhere,
  creditThatStaysHiddenWhere,
  publicArtistWhere,
} from './artist-where';
import { releaseWhere } from './release-where';

import type { Prisma } from '@prisma/client';

// Contract: the artist state fragments and the ADR-0015 credit gates match
// exactly the rows the rule says on a real MongoDB. This is the probe table
// from `docs/lessons/prisma-mongo/gate-where-shapes-need-a-live-probe.md`,
// committed: every artist is credited on one listed release, and `publishedOn`
// / `deletedOn` take each of their three storages. Runs only under
// `pnpm run test:db`.

type Storage = 'absent' | 'null' | 'set';

const STORAGES: Storage[] = ['absent', 'null', 'set'];
const SET_AT = new Date('2026-01-01T00:00:00.000Z');

const dateFor = (storage: Storage): Date | null | undefined =>
  storage === 'set' ? SET_AT : storage === 'null' ? null : undefined;

interface SeededArtist {
  key: string;
  publishedOn: Storage;
  deletedOn: Storage;
}

const prefix = `__contract:${randomUUID()}:`;
const scope = { slug: { startsWith: prefix } } satisfies Prisma.ArtistWhereInput;

const artists: SeededArtist[] = STORAGES.flatMap((publishedOn) =>
  STORAGES.map((deletedOn) => ({
    key: `publishedOn=${publishedOn} deletedOn=${deletedOn}`,
    publishedOn,
    deletedOn,
  }))
);

let listedReleaseId = '';
let draftReleaseId = '';

const expectKeys = (predicate: (artist: SeededArtist) => boolean): string[] =>
  artists
    .filter(predicate)
    .map(({ key }) => key)
    .sort();

const findKeys = async (where: Prisma.ArtistWhereInput): Promise<string[]> => {
  const rows = await prisma.artist.findMany({
    where: { ...scope, AND: [where] },
    select: { slug: true },
  });
  return rows.map(({ slug }) => slug.slice(prefix.length)).sort();
};

beforeAll(async () => {
  const [listed, draft] = await Promise.all([
    prisma.release.create({
      data: {
        title: `${prefix}listed`,
        releasedOn: SET_AT,
        coverArt: 'https://cdn.example.com/contract.webp',
        publishedAt: SET_AT,
      },
      select: { id: true },
    }),
    prisma.release.create({
      data: {
        title: `${prefix}draft`,
        releasedOn: SET_AT,
        coverArt: 'https://cdn.example.com/contract.webp',
      },
      select: { id: true },
    }),
  ]);
  listedReleaseId = listed.id;
  draftReleaseId = draft.id;

  // Serial creates so an omitted field is genuinely absent from the document.
  for (const artist of artists) {
    await prisma.artist.create({
      data: {
        firstName: 'Contract',
        surname: artist.key,
        slug: `${prefix}${artist.key}`,
        publishedOn: dateFor(artist.publishedOn),
        deletedOn: dateFor(artist.deletedOn),
        releases: { create: { releaseId: listedReleaseId } },
      },
    });
  }
  // One extra artist credited on the draft only: never awaiting confirmation.
  await prisma.artist.create({
    data: {
      firstName: 'Contract',
      surname: 'draft-only',
      slug: `${prefix}draft-only`,
      releases: { create: { releaseId: draftReleaseId } },
    },
  });
});

afterAll(async () => {
  const seeded = await prisma.artist.findMany({ where: scope, select: { id: true } });
  const ids = seeded.map(({ id }) => id);
  await prisma.artistRelease.deleteMany({ where: { artistId: { in: ids } } });
  await prisma.artist.deleteMany({ where: scope });
  await prisma.release.deleteMany({ where: { title: { startsWith: prefix } } });
  await prisma.$disconnect();
});

describe('artistWhere (Docker Mongo contract)', () => {
  it('notDeleted matches absent and null deletedOn, never a set one', async () => {
    expect(await findKeys(artistWhere.notDeleted)).toEqual(
      expectKeys(({ deletedOn }) => deletedOn !== 'set')
        .concat('draft-only')
        .sort()
    );
  });

  it('deleted matches only a set deletedOn', async () => {
    expect(await findKeys(artistWhere.deleted)).toEqual(
      expectKeys(({ deletedOn }) => deletedOn === 'set')
    );
  });

  it('unpublished matches absent and null publishedOn, never a set one', async () => {
    expect(await findKeys(artistWhere.unpublished)).toEqual(
      expectKeys(({ publishedOn }) => publishedOn !== 'set')
        .concat('draft-only')
        .sort()
    );
  });

  it('publicArtistWhere matches published artists that are not deleted', async () => {
    expect(await findKeys(publicArtistWhere)).toEqual(
      expectKeys(({ publishedOn, deletedOn }) => publishedOn === 'set' && deletedOn !== 'set')
    );
  });
});

describe('ADR-0015 credit gates (Docker Mongo contract)', () => {
  it('awaiting confirmation on one release: never published, not deleted, credited there', async () => {
    expect(await findKeys(creditAwaitingConfirmationWhere({ releaseId: listedReleaseId }))).toEqual(
      expectKeys(({ publishedOn, deletedOn }) => publishedOn !== 'set' && deletedOn !== 'set')
    );
  });

  it('awaiting confirmation on any listed release ignores a draft-only credit', async () => {
    expect(
      await findKeys(creditAwaitingConfirmationWhere({ release: releaseWhere.listed }))
    ).toEqual(
      expectKeys(({ publishedOn, deletedOn }) => publishedOn !== 'set' && deletedOn !== 'set')
    );
  });

  it('stays hidden: deleted, whatever publishedOn says', async () => {
    expect(await findKeys(creditThatStaysHiddenWhere({ releaseId: listedReleaseId }))).toEqual(
      expectKeys(({ deletedOn }) => deletedOn === 'set')
    );
  });
});
