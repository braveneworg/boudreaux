/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { randomUUID } from 'node:crypto';

import { prisma } from '@/lib/prisma';

import { prismaCounters } from './counters';

import type { Grant } from './types';

// Contract: the counters adapter reads the four stores the way ADR-0018 says
// and charges exactly what a Grant asks for — on a real MongoDB, with the
// mode-less legacy rows and refunded purchases that a mocked client cannot
// reproduce. Runs only under `pnpm run test:db`.

const prefix = `__contract:${randomUUID()}:`;
const NOW = new Date('2026-10-01T12:00:00.000Z');
const HOUR = 60 * 60 * 1000;
const audit = { ipAddress: '127.0.0.1', userAgent: 'contract' };

let userId = '';
let buyerId = '';
let refundedId = '';
let releaseId = '';
let otherReleaseId = '';

const user = () => ({ kind: 'user', userId }) as const;
const guest = (visitorId: string, visitorIds?: string[]) =>
  ({ kind: 'guest', visitorId, ...(visitorIds ? { visitorIds } : {}) }) as const;

const freeEvent = (owner: { userId?: string; visitorId?: string }, at: Date, mode: string | null) =>
  prisma.downloadEvent.create({
    data: {
      userId: owner.userId ?? null,
      visitorId: owner.visitorId ?? null,
      releaseId,
      formatType: 'AAC',
      success: true,
      ...(mode === null ? {} : { mode }),
      downloadedAt: at,
    },
  });

beforeAll(async () => {
  const release = (title: string) =>
    prisma.release.create({
      data: { title: `${prefix}${title}`, releasedOn: NOW, coverArt: 'https://cdn/x.webp' },
      select: { id: true },
    });
  [releaseId, otherReleaseId] = (await Promise.all([release('r1'), release('r2')])).map(
    ({ id }) => id
  );

  const mkUser = (name: string) =>
    prisma.user.create({ data: { email: `${prefix}${name}@example.com` }, select: { id: true } });
  userId = (await mkUser('free')).id;
  buyerId = (await mkUser('buyer')).id;
  refundedId = (await mkUser('refunded')).id;

  await prisma.releasePurchase.create({
    data: {
      userId: buyerId,
      releaseId,
      amountPaid: 500,
      stripePaymentIntentId: `${prefix}pi-buyer`,
    },
  });
  await prisma.releasePurchase.create({
    data: {
      userId: refundedId,
      releaseId,
      amountPaid: 500,
      stripePaymentIntentId: `${prefix}pi-refunded`,
      refundedAt: NOW,
    },
  });
  await prisma.releaseDownload.create({
    data: {
      userId: buyerId,
      releaseId,
      downloadCount: 4,
      lastDownloadedAt: new Date(NOW.getTime() - HOUR),
    },
  });
  await prisma.userDownloadQuota.create({
    data: { userId, uniqueReleaseIds: [otherReleaseId] },
  });

  // Free-throttle rows for the free user: two counted, one paid, one legacy
  // (no mode), one outside the window.
  await freeEvent({ userId }, new Date(NOW.getTime() - 2 * HOUR), 'free');
  await freeEvent({ userId }, new Date(NOW.getTime() - 1 * HOUR), 'free');
  await freeEvent({ userId }, new Date(NOW.getTime() - 3 * HOUR), 'purchased');
  await freeEvent({ userId }, new Date(NOW.getTime() - 4 * HOUR), null);
  await freeEvent({ userId }, new Date(NOW.getTime() - 25 * HOUR), 'free');
  // Guest union: one row under each visitor id.
  await freeEvent({ visitorId: `${prefix}v1` }, new Date(NOW.getTime() - HOUR), 'free');
  await freeEvent({ visitorId: `${prefix}v2` }, new Date(NOW.getTime() - 2 * HOUR), 'free');
});

afterAll(async () => {
  const ids = [userId, buyerId, refundedId].filter(Boolean);
  await prisma.downloadEvent.deleteMany({
    where: { OR: [{ userId: { in: ids } }, { visitorId: { startsWith: prefix } }] },
  });
  await prisma.userDownloadQuota.deleteMany({ where: { userId: { in: ids } } });
  await prisma.releaseDownload.deleteMany({ where: { userId: { in: ids } } });
  await prisma.releasePurchase.deleteMany({ where: { userId: { in: ids } } });
  await prisma.user.deleteMany({ where: { id: { in: ids } } });
  await prisma.release.deleteMany({ where: { title: { startsWith: prefix } } });
  await prisma.$disconnect();
});

describe('prismaCounters.read (Docker Mongo contract)', () => {
  it('reads a free user: no entitlement, lifetime set, only free rows in the window', async () => {
    const facts = await prismaCounters.read(user(), releaseId, NOW);

    expect(facts).toEqual({
      entitled: false,
      lifetime: { distinctReleases: 1, includesThisRelease: false },
      freeThrottle: { count: 2, oldestInWindow: new Date(NOW.getTime() - 2 * HOUR) },
      purchaseThrottle: null,
    });
  });

  it('reads a buyer: entitled, purchase throttle state, no lifetime row needed', async () => {
    const facts = await prismaCounters.read({ kind: 'user', userId: buyerId }, releaseId, NOW);

    expect(facts).toMatchObject({
      entitled: true,
      lifetime: { distinctReleases: 0, includesThisRelease: false },
      purchaseThrottle: { count: 4, lastDownloadedAt: new Date(NOW.getTime() - HOUR) },
    });
  });

  it('treats a refunded purchase as no entitlement', async () => {
    const facts = await prismaCounters.read({ kind: 'user', userId: refundedId }, releaseId, NOW);

    expect(facts).toMatchObject({ entitled: false, purchaseThrottle: null });
  });

  it('reads a guest across its visitor-id union with no lifetime cap', async () => {
    const facts = await prismaCounters.read(
      guest(`${prefix}v1`, [`${prefix}v1`, `${prefix}v2`]),
      releaseId,
      NOW
    );

    expect(facts).toEqual({
      entitled: false,
      lifetime: null,
      freeThrottle: { count: 2, oldestInWindow: new Date(NOW.getTime() - 2 * HOUR) },
      purchaseThrottle: null,
    });
  });
});

describe('prismaCounters.commit (Docker Mongo contract)', () => {
  it('charges a free grant: lifetime set grows, one counted free row is written', async () => {
    const grant: Grant = {
      kind: 'grant',
      mode: 'free',
      formats: [
        { formatType: 'MP3_320KBPS', withdrawn: false },
        { formatType: 'AAC', withdrawn: false },
      ],
      charge: { lifetime: true, freeThrottle: true, purchaseThrottle: false },
    };
    const before = await prismaCounters.read(user(), releaseId, NOW);

    await prismaCounters.commit({
      subject: user(),
      releaseId,
      grant,
      facts: before,
      now: NOW,
      audit,
    });

    const after = await prismaCounters.read(user(), releaseId, NOW);
    expect(after.lifetime).toEqual({ distinctReleases: 2, includesThisRelease: true });
    expect(after.freeThrottle.count).toBe(before.freeThrottle.count + 1);
  });

  it('charges a purchased grant: throttle bumps, audit rows per format, free throttle untouched', async () => {
    const buyer = { kind: 'user', userId: buyerId } as const;
    const grant: Grant = {
      kind: 'grant',
      mode: 'purchased',
      formats: [
        { formatType: 'FLAC', withdrawn: false },
        { formatType: 'AAC', withdrawn: false },
      ],
      charge: { lifetime: false, freeThrottle: false, purchaseThrottle: true },
    };
    const before = await prismaCounters.read(buyer, releaseId, NOW);

    await prismaCounters.commit({
      subject: buyer,
      releaseId,
      grant,
      facts: before,
      now: NOW,
      audit,
    });

    const after = await prismaCounters.read(buyer, releaseId, NOW);
    const rows = await prisma.downloadEvent.findMany({ where: { userId: buyerId, releaseId } });
    expect(after.purchaseThrottle).toEqual({ count: 5, lastDownloadedAt: NOW });
    expect(after.freeThrottle.count).toBe(0);
    expect(rows.map(({ formatType, mode }) => `${formatType}:${mode}`).sort()).toEqual([
      'AAC:purchased',
      'FLAC:purchased',
    ]);
  });

  it('restarts the purchase throttle at one once the idle window has elapsed', async () => {
    const buyer = { kind: 'user', userId: buyerId } as const;
    const later = new Date(NOW.getTime() + 7 * HOUR);
    const grant: Grant = {
      kind: 'grant',
      mode: 'purchased',
      formats: [{ formatType: 'AAC', withdrawn: false }],
      charge: { lifetime: false, freeThrottle: false, purchaseThrottle: true },
    };
    const before = await prismaCounters.read(buyer, releaseId, later);

    await prismaCounters.commit({
      subject: buyer,
      releaseId,
      grant,
      facts: before,
      now: later,
      audit,
    });

    const after = await prismaCounters.read(buyer, releaseId, later);
    expect(after.purchaseThrottle).toEqual({ count: 1, lastDownloadedAt: later });
  });

  it('records a failure as an uncounted row with its reason', async () => {
    const before = await prismaCounters.read(user(), releaseId, NOW);

    await prismaCounters.recordFailure({
      subject: user(),
      releaseId,
      formats: ['AAC'],
      errorCode: 'THROTTLED',
      mode: 'free',
      audit,
    });

    const after = await prismaCounters.read(user(), releaseId, NOW);
    const failed = await prisma.downloadEvent.findMany({
      where: { userId, releaseId, success: false },
    });
    expect(after.freeThrottle.count).toBe(before.freeThrottle.count);
    expect(failed.map(({ errorCode, mode }) => `${errorCode}:${mode}`)).toEqual(['THROTTLED:free']);
  });
});
