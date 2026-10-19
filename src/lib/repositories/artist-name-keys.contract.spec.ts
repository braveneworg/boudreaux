/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { randomUUID } from 'node:crypto';

import { prisma } from '@/lib/prisma';

import { ArtistRepository } from './artist-repository';

// Contract: on a real MongoDB, the name lookup tries the slug, then the
// display name, then first name + surname, the last two case-insensitive, and
// never returns a soft-deleted artist on any key. Runs only under
// `pnpm run test:db`. Every row is seeded here (tests run shuffled and only
// read).

const prefix = `__contract:${randomUUID()}:`;
const artistIds: string[] = [];
const artist = { bySlug: '', byDisplayName: '', byName: '' };

const createArtist = async (
  label: string,
  data: { displayName?: string; firstName?: string; surname?: string; deletedOn?: Date } = {}
): Promise<string> => {
  const { id } = await prisma.artist.create({
    data: { firstName: prefix, surname: label, slug: `${prefix}${label}`, ...data },
    select: { id: true },
  });
  artistIds.push(id);
  return id;
};

/** The keys of a soft-deleted artist; each one alone must find nothing. */
const deleted = {
  slug: `${prefix}deleted`,
  displayName: `${prefix}Deleted Name`,
  firstName: `${prefix}Deleted`,
  surname: 'Gone',
};

beforeAll(async () => {
  // The slug owner and the display-name owner are two artists, so a lookup
  // carrying both keys shows which one wins.
  artist.bySlug = await createArtist('slug-owner');
  artist.byDisplayName = await createArtist('display-name-owner', {
    displayName: `${prefix}Shared Name`,
  });
  artist.byName = await createArtist('name-owner', {
    firstName: `${prefix}First`,
    surname: 'Last',
  });
  await createArtist('deleted', { ...deleted, deletedOn: new Date('2026-01-01T00:00:00.000Z') });
});

afterAll(async () => {
  await prisma.artist.deleteMany({ where: { id: { in: artistIds } } });
  await prisma.$disconnect();
});

describe('ArtistRepository.findByNameKeys (Docker Mongo contract)', () => {
  it('returns the slug match over a display name match', async () => {
    const match = await ArtistRepository.findByNameKeys({
      slug: `${prefix}slug-owner`,
      displayName: `${prefix}Shared Name`,
    });

    expect(match?.id).toBe(artist.bySlug);
  });

  it('matches the display name case-insensitively', async () => {
    const match = await ArtistRepository.findByNameKeys({
      slug: `${prefix}no-such-slug`,
      displayName: `${prefix}SHARED name`.toUpperCase(),
    });

    expect(match?.id).toBe(artist.byDisplayName);
  });

  it('matches first name and surname case-insensitively', async () => {
    const match = await ArtistRepository.findByNameKeys({
      displayName: `${prefix}no such name`,
      firstName: `${prefix}FIRST`.toLowerCase(),
      surname: 'LAST',
    });

    expect(match?.id).toBe(artist.byName);
  });

  it('returns the name projection', async () => {
    const match = await ArtistRepository.findByNameKeys({ slug: `${prefix}name-owner` });

    expect(match).toEqual({
      id: artist.byName,
      displayName: null,
      firstName: `${prefix}First`,
      surname: 'Last',
    });
  });

  it.each([
    ['slug', { slug: deleted.slug }],
    ['display name', { displayName: deleted.displayName }],
    ['first name and surname', { firstName: deleted.firstName, surname: deleted.surname }],
  ])('never returns a soft-deleted artist by its %s', async (_key, keys) => {
    await expect(ArtistRepository.findByNameKeys(keys)).resolves.toBeNull();
  });

  it('returns null when no key matches', async () => {
    const match = await ArtistRepository.findByNameKeys({
      slug: `${prefix}nobody`,
      displayName: `${prefix}Nobody`,
      firstName: `${prefix}Nobody`,
      surname: 'Nowhere',
    });

    expect(match).toBeNull();
  });
});
