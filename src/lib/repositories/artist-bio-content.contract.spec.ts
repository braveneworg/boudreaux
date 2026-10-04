/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { randomUUID } from 'node:crypto';

import { prisma } from '@/lib/prisma';

import { ArtistRepository } from './artist-repository';

// Contract (ADR-0009): a bio generation job suggests genres only into a
// blank field, decided against the row as it is when the bio is persisted —
// not against the snapshot sent to the Lambda at dispatch. An admin who sets
// genres while a run is in flight (runs take minutes) keeps them. Runs only
// under `pnpm run test:db`. Every row is seeded and every persist runs here
// (tests run shuffled); the tests only read.

const prefix = `__contract:${randomUUID()}:`;
const GENERATED_GENRES = 'hip-hop,experimental';
const CURATED_GENRES = 'punk';

const ids: Record<'absent' | 'null' | 'empty' | 'curated' | 'noneGenerated', string> = {
  absent: '',
  null: '',
  empty: '',
  curated: '',
  noneGenerated: '',
};

const generatedContent = (genres: string | null) => ({
  shortBio: '<p>short</p>',
  bio: '<p>long</p>',
  altBio: '<p>alt</p>',
  genres,
  bioModel: 'fake/deterministic',
  images: [],
  links: [],
});

const createArtist = async (label: string, genres?: string | null): Promise<string> => {
  const artist = await prisma.artist.create({
    data: {
      firstName: prefix,
      surname: label,
      slug: `${prefix}${label}`,
      ...(genres !== undefined && { genres }),
    },
    select: { id: true },
  });
  return artist.id;
};

beforeAll(async () => {
  ids.absent = await createArtist('absent');
  ids.null = await createArtist('null', null);
  ids.empty = await createArtist('empty', '');
  // The admin set these after the run was dispatched with a blank field.
  ids.curated = await createArtist('curated', CURATED_GENRES);
  ids.noneGenerated = await createArtist('none-generated', CURATED_GENRES);

  for (const id of [ids.absent, ids.null, ids.empty, ids.curated]) {
    await ArtistRepository.replaceBioContent(id, generatedContent(GENERATED_GENRES));
  }
  await ArtistRepository.replaceBioContent(ids.noneGenerated, generatedContent(null));
});

afterAll(async () => {
  await prisma.artist.deleteMany({ where: { id: { in: Object.values(ids) } } });
  await prisma.$disconnect();
});

const genresOf = async (id: string): Promise<string | null> =>
  (await prisma.artist.findUnique({ where: { id }, select: { genres: true } }))?.genres ?? null;

describe('ArtistRepository.replaceBioContent genres (Docker Mongo contract)', () => {
  it('fills genres that were never stored', async () => {
    expect(await genresOf(ids.absent)).toBe(GENERATED_GENRES);
  });

  it('fills genres stored as null', async () => {
    expect(await genresOf(ids.null)).toBe(GENERATED_GENRES);
  });

  it('fills genres stored as an empty string', async () => {
    expect(await genresOf(ids.empty)).toBe(GENERATED_GENRES);
  });

  it('keeps genres an admin set while the run was in flight', async () => {
    expect(await genresOf(ids.curated)).toBe(CURATED_GENRES);
  });

  it('keeps genres when the run produced none', async () => {
    expect(await genresOf(ids.noneGenerated)).toBe(CURATED_GENRES);
  });

  it('still persists the generated bios over a curated genre field', async () => {
    const artist = await prisma.artist.findUnique({
      where: { id: ids.curated },
      select: { bio: true, shortBio: true },
    });

    expect(artist).toEqual({ bio: '<p>long</p>', shortBio: '<p>short</p>' });
  });
});
