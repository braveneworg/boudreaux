/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { randomUUID } from 'node:crypto';

import { prisma } from '@/lib/prisma';

import type { Prisma } from '@prisma/client';

// Contract: what a real MongoDB returns for the `Artist.links` composite
// (ADR-0020) in each way it can be stored — absent, a full document, and a
// document an older write left without one of its lists — and that a write
// replaces the whole composite and keeps the admin's order. Runs only under
// `pnpm run test:db`.

const prefix = `__contract:${randomUUID()}:`;

const createArtist = async (
  key: string,
  links?: Prisma.ArtistCreateInput['links']
): Promise<string> => {
  const { id } = await prisma.artist.create({
    data: {
      firstName: prefix,
      surname: key,
      slug: `${prefix}${key}`,
      ...(links === undefined ? {} : { links }),
    },
    select: { id: true },
  });
  return id;
};

const readLinks = async (id: string) => {
  const row = await prisma.artist.findUniqueOrThrow({ where: { id }, select: { links: true } });
  return row.links;
};

afterAll(async () => {
  await prisma.artist.deleteMany({ where: { firstName: prefix } });
  await prisma.$disconnect();
});

describe('Artist.links composite', () => {
  it('reads an absent composite as null', async () => {
    const id = await createArtist('absent');

    expect(await readLinks(id)).toBeNull();
  });

  it('reads a stored composite back whole, lists in the written order', async () => {
    const id = await createArtist('full', {
      websites: [
        { label: 'Official site', url: 'https://example.com' },
        { url: 'https://example.bandcamp.com' },
      ],
      social: [{ url: 'https://www.instagram.com/example' }],
      contact: [
        {
          heading: 'Booking',
          links: [
            { label: 'Agency', url: 'mailto:booking@example.com' },
            { label: 'Phone', url: 'tel:+18605550134' },
          ],
        },
        { heading: 'Merch', links: [] },
      ],
    });

    expect(await readLinks(id)).toEqual({
      websites: [
        { label: 'Official site', url: 'https://example.com' },
        { label: null, url: 'https://example.bandcamp.com' },
      ],
      social: [{ label: null, url: 'https://www.instagram.com/example' }],
      contact: [
        {
          heading: 'Booking',
          links: [
            { label: 'Agency', url: 'mailto:booking@example.com' },
            { label: 'Phone', url: 'tel:+18605550134' },
          ],
        },
        { heading: 'Merch', links: [] },
      ],
    });
  });

  // A document written before a section existed has no such list at all.
  // Prisma reads a missing composite list as an empty one, so the page and
  // the form never see `undefined` for a section.
  it('reads a missing section list as an empty list', async () => {
    const id = await createArtist('partial');
    await prisma.$runCommandRaw({
      update: 'Artist',
      updates: [
        {
          q: { _id: { $oid: id } },
          u: { $set: { links: { websites: [{ url: 'https://example.com' }] } } },
        },
      ],
    });

    expect(await readLinks(id)).toEqual({
      websites: [{ label: null, url: 'https://example.com' }],
      social: [],
      contact: [],
    });
  });

  it('replaces the whole composite on an update, dropping what the write omits', async () => {
    const id = await createArtist('replace', {
      websites: [{ url: 'https://old.example.com' }],
      social: [{ url: 'https://www.instagram.com/old' }],
      contact: [{ heading: 'Booking', links: [{ url: 'mailto:old@example.com' }] }],
    });

    await prisma.artist.update({
      where: { id },
      data: {
        links: {
          websites: [{ url: 'https://b.example.com' }, { url: 'https://a.example.com' }],
          social: [],
          contact: [],
        },
      },
    });

    expect(await readLinks(id)).toEqual({
      websites: [
        { label: null, url: 'https://b.example.com' },
        { label: null, url: 'https://a.example.com' },
      ],
      social: [],
      contact: [],
    });
  });

  it('unsets the composite when the update writes null', async () => {
    const id = await createArtist('unset', { websites: [], social: [], contact: [] });

    await prisma.artist.update({ where: { id }, data: { links: { unset: true } } });

    expect(await readLinks(id)).toBeNull();
  });
});
