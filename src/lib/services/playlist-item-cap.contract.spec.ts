/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { randomUUID } from 'node:crypto';

import { MAX_PLAYLIST_ITEMS } from '@/lib/constants/playlists';
import { prisma } from '@/lib/prisma';
import { DataError } from '@/lib/types/domain/errors';

import { PlaylistService } from './playlist-service';

// Contract: on a real MongoDB, through `PlaylistService.addItem` and the real
// repository transaction, a playlist never holds more than
// `MAX_PLAYLIST_ITEMS`. Adds that land together on a playlist one under its
// cap may each have read the old count; at most one of them may be stored.
//
// Reach: one browser tab cannot run two adds at once, because Next.js
// dispatches Server Actions one at a time per client. Two tabs or two devices
// signed in as the same listener can. This is the two-tab case, without the
// action gate in front of it. Runs only under `pnpm run test:db`.

const prefix = `__contract:${randomUUID()}:`;

/** Playlists raced, each from one under its cap. */
const PLAYLISTS = 6;
/** Adds fired at each playlist. */
const CONCURRENT_ADDS = 12;
/**
 * Gap between the adds' starts. Adds that start together overlap in their
 * transactions and MongoDB aborts all but one with a write conflict; the cap
 * is lost to an add that loads the playlist before another commits and opens
 * its transaction after. A few milliseconds apart gives both shapes.
 */
const STAGGER_MS = 3;

interface RaceOutcome {
  stored: number;
  itemCount: number;
  sortOrders: number[];
  results: string[];
}

let userId = '';
let videoId = '';
const playlistIds: string[] = [];
const outcomes: RaceOutcome[] = [];

/** `stored`, or the code a refused add carried. */
const describeResult = (result: PromiseSettledResult<unknown>): string => {
  if (result.status === 'fulfilled') return 'stored';
  return result.reason instanceof DataError ? result.reason.code : 'non-data-error';
};

// Every row is seeded, and every write is run, here: the tests run shuffled
// and only read.
beforeAll(async () => {
  ({ id: userId } = await prisma.user.create({
    data: { email: `${prefix}owner@example.com` },
    select: { id: true },
  }));
  ({ id: videoId } = await prisma.video.create({
    data: {
      title: `${prefix}video`,
      artist: `${prefix}artist`,
      category: 'MUSIC',
      s3Key: `media/videos/${prefix}video.mp4`,
      fileName: 'video.mp4',
      mimeType: 'video/mp4',
      durationSeconds: 60,
      releasedOn: new Date('2026-01-01T00:00:00.000Z'),
      publishedAt: new Date('2026-01-01T00:00:00.000Z'),
    },
    select: { id: true },
  }));

  // One under the cap, seeded one playlist at a time (fresh-collection
  // read-back race, docs/lessons/prisma-mongo).
  for (let index = 0; index < PLAYLISTS; index++) {
    const { id } = await prisma.playlist.create({
      data: {
        ownerId: userId,
        title: `${prefix}playlist-${index}`,
        itemCount: MAX_PLAYLIST_ITEMS - 1,
        totalDuration: (MAX_PLAYLIST_ITEMS - 1) * 60,
      },
      select: { id: true },
    });
    await prisma.playlistItem.createMany({
      data: Array.from({ length: MAX_PLAYLIST_ITEMS - 1 }, (_, sortOrder) => ({
        playlistId: id,
        itemType: 'video',
        videoId,
        title: `${prefix}item`,
        artistName: `${prefix}artist`,
        duration: 60,
        sortOrder,
      })),
    });
    playlistIds.push(id);
  }

  for (const playlistId of playlistIds) {
    const results = await Promise.allSettled(
      Array.from({ length: CONCURRENT_ADDS }, async (_, index) => {
        await new Promise((resolve) => setTimeout(resolve, index * STAGGER_MS));
        return PlaylistService.addItem(userId, {
          playlistId,
          ref: { itemType: 'video', videoId },
          force: true,
        });
      })
    );
    const playlist = await prisma.playlist.findUniqueOrThrow({
      where: { id: playlistId },
      select: { itemCount: true },
    });
    const items = await prisma.playlistItem.findMany({
      where: { playlistId },
      select: { sortOrder: true },
      orderBy: { sortOrder: 'asc' },
    });
    outcomes.push({
      stored: items.length,
      itemCount: playlist.itemCount,
      sortOrders: items.map(({ sortOrder }) => sortOrder),
      results: results.map(describeResult),
    });
  }
}, 120_000);

afterAll(async () => {
  if (playlistIds.length > 0) {
    await prisma.playlistItem.deleteMany({ where: { playlistId: { in: playlistIds } } });
    await prisma.playlist.deleteMany({ where: { id: { in: playlistIds } } });
  }
  if (videoId) await prisma.video.deleteMany({ where: { id: videoId } });
  if (userId) await prisma.user.deleteMany({ where: { id: userId } });
  await prisma.$disconnect();
});

describe('playlist item cap under concurrent adds (Docker Mongo contract)', () => {
  it('never stores more items than the cap', () => {
    expect(outcomes.map(({ stored }) => stored)).toEqual(
      Array.from({ length: PLAYLISTS }, () => MAX_PLAYLIST_ITEMS)
    );
  });

  it('keeps the denormalized itemCount equal to the stored items', () => {
    expect(outcomes.map(({ itemCount, stored }) => itemCount - stored)).toEqual(
      Array.from({ length: PLAYLISTS }, () => 0)
    );
  });

  it('keeps sortOrder dense, with no position taken twice', () => {
    expect(outcomes.map(({ sortOrders }) => sortOrders)).toEqual(
      Array.from({ length: PLAYLISTS }, () =>
        Array.from({ length: MAX_PLAYLIST_ITEMS }, (_, index) => index)
      )
    );
  });

  it('stores exactly one of the racing adds per playlist', () => {
    expect(
      outcomes.map(({ results }) => results.filter((result) => result === 'stored').length)
    ).toEqual(Array.from({ length: PLAYLISTS }, () => 1));
  });
});
