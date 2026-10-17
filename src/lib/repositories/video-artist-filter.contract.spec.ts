/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { randomUUID } from 'node:crypto';

import { prisma } from '@/lib/prisma';

import { VideoRepository } from './video-repository';

// Contract: on a real MongoDB, the public video listing filtered by an artist
// slug holds exactly the live videos that public artist holds a video credit
// on. A hidden artist's slug matches nothing, and a draft, scheduled or
// archived video never shows. Runs only under `pnpm run test:db`.

const prefix = `__contract:${randomUUID()}:`;
const PAST = new Date('2026-01-01T00:00:00.000Z');
const FUTURE = new Date('2100-01-01T00:00:00.000Z');

const slugOf = (label: string): string => `${prefix}${label}`;
const titleOf = (label: string): string => `${prefix}${label}`;

const createArtist = async (label: string, publishedOn?: Date): Promise<string> => {
  const { id } = await prisma.artist.create({
    data: {
      firstName: prefix,
      surname: label,
      slug: slugOf(label),
      ...(publishedOn && { publishedOn }),
    },
    select: { id: true },
  });
  return id;
};

const createVideo = async (
  label: string,
  artistIds: string[],
  state: { publishedAt?: Date; archivedAt?: Date }
): Promise<void> => {
  const { id } = await prisma.video.create({
    data: {
      title: titleOf(label),
      // Display copy only: names an artist the filter must not match on.
      artist: slugOf('credited'),
      category: 'MUSIC',
      s3Key: `contract/${randomUUID()}.mp4`,
      fileName: 'contract.mp4',
      mimeType: 'video/mp4',
      releasedOn: PAST,
      ...state,
    },
    select: { id: true },
  });
  await prisma.videoArtist.createMany({
    data: artistIds.map((artistId, sortOrder) => ({ videoId: id, artistId, sortOrder })),
  });
};

const findTitles = async (artist: string): Promise<string[]> =>
  (await VideoRepository.findPublished({ artist, take: 100 }))
    .map(({ title }) => title)
    .filter((title) => title.startsWith(prefix))
    .sort();

// Every row is seeded here, serially: the tests run shuffled, and concurrent
// creates race the read-back on a fresh collection.
beforeAll(async () => {
  const credited = await createArtist('credited', PAST);
  const other = await createArtist('other', PAST);
  const hidden = await createArtist('hidden');

  await createVideo('live', [credited], { publishedAt: PAST });
  await createVideo('featured', [other, credited], { publishedAt: PAST });
  await createVideo('draft', [credited], {});
  await createVideo('scheduled', [credited], { publishedAt: FUTURE });
  await createVideo('archived', [credited], { publishedAt: PAST, archivedAt: PAST });
  await createVideo('other-artist', [other], { publishedAt: PAST });
  await createVideo('hidden-artist', [hidden], { publishedAt: PAST });
});

afterAll(async () => {
  const artists = await prisma.artist.findMany({
    where: { slug: { startsWith: prefix } },
    select: { id: true },
  });
  await prisma.videoArtist.deleteMany({ where: { artistId: { in: artists.map(({ id }) => id) } } });
  await prisma.video.deleteMany({ where: { title: { startsWith: prefix } } });
  await prisma.artist.deleteMany({ where: { slug: { startsWith: prefix } } });
  await prisma.$disconnect();
});

describe('published videos filtered by artist (Docker Mongo contract)', () => {
  it('holds the live videos the artist is credited on, primary or featured', async () => {
    expect(await findTitles(slugOf('credited'))).toEqual(
      [titleOf('featured'), titleOf('live')].sort()
    );
  });

  it("leaves out another artist's video", async () => {
    expect(await findTitles(slugOf('credited'))).not.toContain(titleOf('other-artist'));
  });

  it.each(['draft', 'scheduled', 'archived'])('leaves out the %s video', async (label) => {
    expect(await findTitles(slugOf('credited'))).not.toContain(titleOf(label));
  });

  it("matches nothing for a hidden artist's slug", async () => {
    expect(await findTitles(slugOf('hidden'))).toEqual([]);
  });
});
