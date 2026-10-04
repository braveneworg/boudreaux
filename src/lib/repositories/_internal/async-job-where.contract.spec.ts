/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { randomUUID } from 'node:crypto';

import { prisma } from '@/lib/prisma';
import { STALE_JOB_MS } from '@/utils/async-job-lifecycle';

import { mayBeginRunWhere } from './async-job-where';

// Contract: on a real MongoDB, `mayBeginRunWhere` matches exactly the jobs
// `runnerShouldSkip` would not skip, for every way the status and start can
// be stored — and two runners racing to begin one job see exactly one
// winner. Runs only under `pnpm run test:db`.

const NOW = new Date('2026-10-03T12:00:00.000Z');
const FRESH = new Date(NOW.getTime() - 60_000);
const STALE = new Date(NOW.getTime() - STALE_JOB_MS - 60_000);

type StatusStorage = 'absent' | 'null' | 'pending' | 'processing' | 'succeeded' | 'failed';
type StartStorage = 'absent' | 'null' | 'fresh' | 'stale';

const STATUSES: StatusStorage[] = [
  'absent',
  'null',
  'pending',
  'processing',
  'succeeded',
  'failed',
];
const STARTS: StartStorage[] = ['absent', 'null', 'fresh', 'stale'];

const statusFor = (storage: StatusStorage): string | null | undefined =>
  storage === 'absent' ? undefined : storage === 'null' ? null : storage;
const startFor = (storage: StartStorage): Date | null | undefined =>
  storage === 'fresh' ? FRESH : storage === 'stale' ? STALE : storage === 'null' ? null : undefined;

const prefix = `__contract:${randomUUID()}:`;
const slugOf = (status: StatusStorage, start: StartStorage): string =>
  `${prefix}status=${status}:start=${start}`;
const scope = { slug: { startsWith: `${prefix}status=` } };

/** What the pure gate says: only a fresh `processing` job is skipped. */
const mayBegin = (status: StatusStorage, start: StartStorage): boolean =>
  !(status === 'processing' && start === 'fresh');

const expectSlugs = (
  predicate: (status: StatusStorage, start: StartStorage) => boolean
): string[] =>
  STATUSES.flatMap((status) =>
    STARTS.filter((start) => predicate(status, start)).map((start) => slugOf(status, start))
  ).sort();

let raceId = '';

beforeAll(async () => {
  for (const status of STATUSES) {
    for (const start of STARTS) {
      await prisma.artist.create({
        data: {
          firstName: prefix,
          surname: 'contract',
          slug: slugOf(status, start),
          bioStatus: statusFor(status),
          bioStartedAt: startFor(start),
        },
      });
    }
  }
  const race = await prisma.artist.create({
    data: { firstName: prefix, surname: 'race', slug: `${prefix}race`, bioStatus: 'pending' },
    select: { id: true },
  });
  raceId = race.id;
});

afterAll(async () => {
  await prisma.artist.deleteMany({ where: { slug: { startsWith: prefix } } });
  await prisma.$disconnect();
});

describe('mayBeginRunWhere (Docker Mongo contract)', () => {
  it('seeds one row per status × start storage', async () => {
    const rows = await prisma.artist.findMany({ where: scope, select: { slug: true } });
    expect(rows.map(({ slug }) => slug).sort()).toEqual(expectSlugs(() => true));
  });

  it('matches every job the runner gate would not skip, for every storage', async () => {
    const rows = await prisma.artist.findMany({
      where: { ...scope, AND: [mayBeginRunWhere('bioStatus', 'bioStartedAt', NOW)] },
      select: { slug: true },
    });

    expect(rows.map(({ slug }) => slug).sort()).toEqual(expectSlugs(mayBegin));
  });

  it('lets exactly one of two racing runners begin the same job', async () => {
    const begin = () =>
      prisma.artist.updateMany({
        where: { id: raceId, AND: [mayBeginRunWhere('bioStatus', 'bioStartedAt', new Date())] },
        data: { bioStatus: 'processing', bioStartedAt: new Date() },
      });

    const [first, second] = await Promise.all([begin(), begin()]);

    expect([first.count, second.count].sort()).toEqual([0, 1]);
  });
});
