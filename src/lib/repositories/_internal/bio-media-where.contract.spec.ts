/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { randomUUID } from 'node:crypto';

import { prisma } from '@/lib/prisma';

import { bioLinkWhere, bioMediaWhere } from './bio-media-where';

import type { Prisma } from '@prisma/client';

// Contract: the bio-media fragments match exactly the rows the rule says on a
// real MongoDB, for every way `origin` (both models) and `reference` (links)
// can be stored. Runs only under `pnpm run test:db`.

type OriginStorage = 'absent' | 'null' | 'generated' | 'custom';
type ReferenceStorage = 'absent' | 'null' | 'true' | 'false';

const ORIGINS: OriginStorage[] = ['absent', 'null', 'generated', 'custom'];
const REFERENCES: ReferenceStorage[] = ['absent', 'null', 'true', 'false'];

const originFor = (storage: OriginStorage): string | null | undefined =>
  storage === 'absent' ? undefined : storage === 'null' ? null : storage;
const referenceFor = (storage: ReferenceStorage): boolean | null | undefined =>
  storage === 'absent' ? undefined : storage === 'null' ? null : storage === 'true';

const prefix = `__contract:${randomUUID()}:`;
let artistId = '';

const imageUrlOf = (origin: OriginStorage): string => `${prefix}image:origin=${origin}`;
const linkUrlOf = (origin: OriginStorage, reference: ReferenceStorage): string =>
  `${prefix}link:origin=${origin}:reference=${reference}`;

const expectImages = (predicate: (origin: OriginStorage) => boolean): string[] =>
  ORIGINS.filter(predicate).map(imageUrlOf).sort();
const expectLinks = (
  predicate: (origin: OriginStorage, reference: ReferenceStorage) => boolean
): string[] =>
  ORIGINS.flatMap((origin) =>
    REFERENCES.filter((reference) => predicate(origin, reference)).map((reference) =>
      linkUrlOf(origin, reference)
    )
  ).sort();

const findImages = async (where: Prisma.ArtistBioImageWhereInput): Promise<string[]> => {
  const rows = await prisma.artistBioImage.findMany({
    where: { artistId, AND: [where] },
    select: { url: true },
  });
  return rows.map(({ url }) => url).sort();
};
const findLinks = async (where: Prisma.ArtistBioLinkWhereInput): Promise<string[]> => {
  const rows = await prisma.artistBioLink.findMany({
    where: { artistId, AND: [where] },
    select: { url: true },
  });
  return rows.map(({ url }) => url).sort();
};

beforeAll(async () => {
  const artist = await prisma.artist.create({
    data: { firstName: prefix, surname: 'contract', slug: `${prefix}slug` },
    select: { id: true },
  });
  artistId = artist.id;

  // One image per origin storage, one link per (origin, reference) pair.
  // Serial creates so an omitted field is genuinely absent from the document;
  // the schema defaults `reference` to true, so "absent" must be written as a
  // raw unset, which Prisma's create cannot do — see the note in the test.
  for (const origin of ORIGINS) {
    await prisma.artistBioImage.create({
      data: { artistId, url: imageUrlOf(origin), origin: originFor(origin) },
    });
    for (const reference of REFERENCES) {
      await prisma.artistBioLink.create({
        data: {
          artistId,
          label: 'contract',
          url: linkUrlOf(origin, reference),
          origin: originFor(origin),
          reference: referenceFor(reference),
        },
      });
    }
  }
  // `reference` has a schema default, so Prisma writes `true` where the data
  // omitted it. Unset the field on the "absent" rows the way a legacy document
  // has it, so the contract covers the storage the fragment exists for.
  await prisma.$runCommandRaw({
    update: 'ArtistBioLink',
    updates: [
      {
        q: {
          url: {
            $regex: `^${prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}link:.*:reference=absent$`,
          },
        },
        u: { $unset: { reference: '' } },
        multi: true,
      },
    ],
  });
});

afterAll(async () => {
  await prisma.artistBioImage.deleteMany({ where: { artistId } });
  await prisma.artistBioLink.deleteMany({ where: { artistId } });
  await prisma.artist.deleteMany({ where: { id: artistId } });
  await prisma.$disconnect();
});

describe('bioMediaWhere (Docker Mongo contract)', () => {
  it('seeds one image per origin storage and one link per pair', async () => {
    expect(await findImages({})).toEqual(expectImages(() => true));
    expect(await findLinks({})).toEqual(expectLinks(() => true));
  });

  it('generatedOrLegacy matches generated, null and absent origin on both models', async () => {
    expect(await findImages(bioMediaWhere.generatedOrLegacy)).toEqual(
      expectImages((origin) => origin !== 'custom')
    );
    expect(await findLinks(bioMediaWhere.generatedOrLegacy)).toEqual(
      expectLinks((origin) => origin !== 'custom')
    );
  });

  it('a bare null filter misses the absent row (the defect this fragment replaces)', async () => {
    expect(await findImages({ origin: null })).toEqual([imageUrlOf('null')]);
  });

  it('custom matches only an explicit custom origin', async () => {
    expect(await findImages(bioMediaWhere.custom)).toEqual(
      expectImages((origin) => origin === 'custom')
    );
  });
});

describe('bioLinkWhere (Docker Mongo contract)', () => {
  it('the absent-reference rows are genuinely unset, not defaulted', async () => {
    const rows = await prisma.artistBioLink.findMany({
      where: { artistId, reference: { isSet: false } },
      select: { url: true },
    });
    expect(rows.map(({ url }) => url).sort()).toEqual(
      expectLinks((_, reference) => reference === 'absent')
    );
  });

  it('reference matches true, null and absent — only an explicit false opts out', async () => {
    expect(await findLinks(bioLinkWhere.reference)).toEqual(
      expectLinks((_, reference) => reference !== 'false')
    );
  });
});
