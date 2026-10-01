/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { randomUUID } from 'node:crypto';

import { prisma } from '@/lib/prisma';

import { videoLiveAt, videoScheduledAt, videoWhere } from './video-where';

import type { Prisma } from '@prisma/client';

// Contract: `videoWhere` and the two dated fragments match exactly the rows the
// rule says on a real MongoDB, for every way `publishedAt` and `archivedAt`
// can be stored. Runs only under `pnpm run test:db`.

const NOW = new Date('2026-06-01T00:00:00.000Z');
const PAST = new Date('2026-01-01T00:00:00.000Z');
const FUTURE = new Date('2026-12-01T00:00:00.000Z');

type PublishedStorage = 'absent' | 'null' | 'past' | 'future';
type ArchivedStorage = 'absent' | 'null' | 'set';

const PUBLISHED: PublishedStorage[] = ['absent', 'null', 'past', 'future'];
const ARCHIVED: ArchivedStorage[] = ['absent', 'null', 'set'];

const publishedFor = (storage: PublishedStorage): Date | null | undefined =>
  storage === 'past' ? PAST : storage === 'future' ? FUTURE : storage === 'null' ? null : undefined;
const archivedFor = (storage: ArchivedStorage): Date | null | undefined =>
  storage === 'set' ? PAST : storage === 'null' ? null : undefined;

const prefix = `__contract:${randomUUID()}:`;
const titleOf = (published: PublishedStorage, archived: ArchivedStorage): string =>
  `${prefix}publishedAt=${published}:archivedAt=${archived}`;

const scope = (): Prisma.VideoWhereInput => ({ title: { startsWith: prefix } });

const expectTitles = (
  predicate: (published: PublishedStorage, archived: ArchivedStorage) => boolean
): string[] =>
  PUBLISHED.flatMap((published) =>
    ARCHIVED.filter((archived) => predicate(published, archived)).map((archived) =>
      titleOf(published, archived)
    )
  ).sort();

const findTitles = async (where: Prisma.VideoWhereInput): Promise<string[]> => {
  const rows = await prisma.video.findMany({
    where: { ...scope(), AND: [where] },
    select: { title: true },
  });
  return rows.map(({ title }) => title).sort();
};

beforeAll(async () => {
  // One row per (publishedAt, archivedAt) storage pair. Serial creates so an
  // omitted field is genuinely absent from the document.
  for (const published of PUBLISHED) {
    for (const archived of ARCHIVED) {
      await prisma.video.create({
        data: {
          title: titleOf(published, archived),
          artist: 'contract',
          category: 'MUSIC',
          s3Key: `contract/${randomUUID()}.mp4`,
          fileName: 'contract.mp4',
          mimeType: 'video/mp4',
          publishedAt: publishedFor(published),
          archivedAt: archivedFor(archived),
        },
      });
    }
  }
});

afterAll(async () => {
  await prisma.video.deleteMany({ where: scope() });
  await prisma.$disconnect();
});

describe('videoWhere (Docker Mongo contract)', () => {
  it('seeds one row per storage pair', async () => {
    expect(await findTitles({})).toEqual(expectTitles(() => true));
  });

  it('draft matches absent and null publishedAt', async () => {
    expect(await findTitles(videoWhere.draft)).toEqual(
      expectTitles((published) => published === 'absent' || published === 'null')
    );
  });

  it('a bare null filter misses the absent row (the defect the fragments replace)', async () => {
    expect(await findTitles({ publishedAt: null })).toEqual(
      expectTitles((published) => published === 'null')
    );
  });

  it('published matches a past or future go-live moment: scheduled ∪ live', async () => {
    expect(await findTitles(videoWhere.published)).toEqual(
      expectTitles((published) => published === 'past' || published === 'future')
    );
  });

  it('live at now matches only a go-live moment that has arrived', async () => {
    expect(await findTitles(videoLiveAt(NOW))).toEqual(
      expectTitles((published) => published === 'past')
    );
  });

  it('scheduled at now matches only a go-live moment still ahead', async () => {
    expect(await findTitles(videoScheduledAt(NOW))).toEqual(
      expectTitles((published) => published === 'future')
    );
  });

  it('notArchived matches absent and null archivedAt; archived only a set one', async () => {
    expect(await findTitles(videoWhere.notArchived)).toEqual(
      expectTitles((_, archived) => archived !== 'set')
    );
    expect(await findTitles(videoWhere.archived)).toEqual(
      expectTitles((_, archived) => archived === 'set')
    );
  });
});
