/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { Prisma } from '@prisma/client';

import { prisma } from '@/lib/prisma';
import { DataError } from '@/lib/types/domain/errors';
import type { AddPlaylistItemData, CreatePlaylistData } from '@/lib/types/domain/playlist';

import { PlaylistRepository } from './playlist-repository';

vi.mock('server-only', () => ({}));

vi.mock('@/lib/prisma', () => {
  const playlist = {
    create: vi.fn(),
    findUnique: vi.fn(),
    findMany: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  };
  const playlistItem = {
    create: vi.fn(),
    createMany: vi.fn(),
    delete: vi.fn(),
    update: vi.fn(),
    updateMany: vi.fn(),
    findFirst: vi.fn(),
    findMany: vi.fn(),
  };
  return {
    prisma: {
      playlist,
      playlistItem,
      $transaction: vi.fn(
        async (
          fn: (tx: {
            playlist: typeof playlist;
            playlistItem: typeof playlistItem;
          }) => Promise<unknown>
        ) => fn({ playlist, playlistItem })
      ),
    },
  };
});

const OWNER_ID = 'a'.repeat(24);
const OTHER_OWNER_ID = 'b'.repeat(24);
const PLAYLIST_ID = 'c'.repeat(24);
const ITEM_ID = 'd'.repeat(24);
const contains = (value: string) => ({ contains: value, mode: 'insensitive' });

const mockPlaylist = { id: PLAYLIST_ID, title: 'Mix', ownerId: OWNER_ID };

const createData: CreatePlaylistData = {
  ownerId: OWNER_ID,
  title: 'Mix',
  isPublic: false,
  coverImages: [],
};

const trackItem: AddPlaylistItemData = {
  itemType: 'track',
  trackFileId: 'f'.repeat(24),
  releaseId: 'e'.repeat(24),
  videoId: null,
  title: 'Song One',
  artistName: 'Artist One',
  duration: 180,
};

const videoItem: AddPlaylistItemData = {
  itemType: 'video',
  trackFileId: null,
  releaseId: null,
  videoId: '1'.repeat(24),
  title: 'Clip Two',
  artistName: 'Artist Two',
  duration: 240,
};

describe('PlaylistRepository', () => {
  beforeEach(() => vi.clearAllMocks());

  describe('create', () => {
    it('creates a playlist from the mapped create data', async () => {
      vi.mocked(prisma.playlist.create).mockResolvedValue(mockPlaylist as never);

      const result = await PlaylistRepository.create(createData);

      expect(result).toEqual(mockPlaylist);
      expect(prisma.playlist.create).toHaveBeenCalledWith({ data: createData });
    });

    it('wraps a Prisma duplicate error as a DataError with code DUPLICATE', async () => {
      vi.mocked(prisma.playlist.create).mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError('x', { code: 'P2002', clientVersion: '6' })
      );

      await expect(PlaylistRepository.create(createData)).rejects.toMatchObject({
        code: 'DUPLICATE',
      });
    });

    it('throws a DataError instance on failure', async () => {
      vi.mocked(prisma.playlist.create).mockRejectedValue(
        new Prisma.PrismaClientInitializationError('no db', '6')
      );

      await expect(PlaylistRepository.create(createData)).rejects.toBeInstanceOf(DataError);
    });
  });

  describe('createWithItems', () => {
    it('runs the whole build in a single transaction', async () => {
      vi.mocked(prisma.playlist.create).mockResolvedValue(mockPlaylist as never);
      vi.mocked(prisma.playlistItem.createMany).mockResolvedValue({ count: 2 });
      vi.mocked(prisma.playlist.update).mockResolvedValue(mockPlaylist as never);

      await PlaylistRepository.createWithItems(createData, [trackItem, videoItem]);

      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    });

    it('creates the playlist from the mapped create data', async () => {
      vi.mocked(prisma.playlist.create).mockResolvedValue(mockPlaylist as never);
      vi.mocked(prisma.playlistItem.createMany).mockResolvedValue({ count: 2 });
      vi.mocked(prisma.playlist.update).mockResolvedValue(mockPlaylist as never);

      await PlaylistRepository.createWithItems(createData, [trackItem, videoItem]);

      expect(prisma.playlist.create).toHaveBeenCalledWith({ data: createData });
    });

    it('bulk-inserts items with dense sortOrder equal to their index', async () => {
      vi.mocked(prisma.playlist.create).mockResolvedValue(mockPlaylist as never);
      vi.mocked(prisma.playlistItem.createMany).mockResolvedValue({ count: 2 });
      vi.mocked(prisma.playlist.update).mockResolvedValue(mockPlaylist as never);

      await PlaylistRepository.createWithItems(createData, [trackItem, videoItem]);

      expect(prisma.playlistItem.createMany).toHaveBeenCalledWith({
        data: [
          { ...trackItem, playlistId: PLAYLIST_ID, sortOrder: 0 },
          { ...videoItem, playlistId: PLAYLIST_ID, sortOrder: 1 },
        ],
      });
    });

    it('skips createMany for an empty item batch', async () => {
      vi.mocked(prisma.playlist.create).mockResolvedValue(mockPlaylist as never);
      vi.mocked(prisma.playlist.update).mockResolvedValue(mockPlaylist as never);

      await PlaylistRepository.createWithItems(createData, []);

      expect(prisma.playlistItem.createMany).not.toHaveBeenCalled();
    });

    it('sets itemCount and totalDuration to the item summary', async () => {
      vi.mocked(prisma.playlist.create).mockResolvedValue(mockPlaylist as never);
      vi.mocked(prisma.playlistItem.createMany).mockResolvedValue({ count: 2 });
      vi.mocked(prisma.playlist.update).mockResolvedValue(mockPlaylist as never);

      await PlaylistRepository.createWithItems(createData, [trackItem, videoItem]);

      expect(prisma.playlist.update).toHaveBeenCalledWith({
        where: { id: PLAYLIST_ID },
        data: { itemCount: 2, totalDuration: 420 },
      });
    });

    it('returns the created playlist record', async () => {
      vi.mocked(prisma.playlist.create).mockResolvedValue(mockPlaylist as never);
      vi.mocked(prisma.playlistItem.createMany).mockResolvedValue({ count: 2 });
      vi.mocked(prisma.playlist.update).mockResolvedValue(mockPlaylist as never);

      const result = await PlaylistRepository.createWithItems(createData, [trackItem, videoItem]);

      expect(result).toEqual(mockPlaylist);
    });
  });

  describe('findById', () => {
    it('finds a playlist by id', async () => {
      vi.mocked(prisma.playlist.findUnique).mockResolvedValue(mockPlaylist as never);

      const result = await PlaylistRepository.findById(PLAYLIST_ID);

      expect(result).toEqual(mockPlaylist);
      expect(prisma.playlist.findUnique).toHaveBeenCalledWith({ where: { id: PLAYLIST_ID } });
    });

    it('returns null when the playlist is not found', async () => {
      vi.mocked(prisma.playlist.findUnique).mockResolvedValue(null);

      const result = await PlaylistRepository.findById('missing');

      expect(result).toBeNull();
    });
  });

  describe('findByIdWithItems', () => {
    it('includes items ordered by sortOrder asc', async () => {
      vi.mocked(prisma.playlist.findUnique).mockResolvedValue({
        ...mockPlaylist,
        items: [],
      } as never);

      await PlaylistRepository.findByIdWithItems(PLAYLIST_ID);

      expect(prisma.playlist.findUnique).toHaveBeenCalledWith({
        where: { id: PLAYLIST_ID },
        include: { items: { orderBy: { sortOrder: 'asc' } } },
      });
    });

    it('returns null when the playlist is not found', async () => {
      vi.mocked(prisma.playlist.findUnique).mockResolvedValue(null);

      const result = await PlaylistRepository.findByIdWithItems('missing');

      expect(result).toBeNull();
    });
  });

  describe('findManyByOwner', () => {
    it('lists an owner page ordered by updatedAt desc with defaults', async () => {
      vi.mocked(prisma.playlist.findMany).mockResolvedValue([mockPlaylist] as never);

      const result = await PlaylistRepository.findManyByOwner(OWNER_ID, {});

      expect(result).toEqual([mockPlaylist]);
      expect(prisma.playlist.findMany).toHaveBeenCalledWith({
        where: { ownerId: OWNER_ID },
        orderBy: { updatedAt: 'desc' },
        skip: 0,
        take: 24,
      });
    });

    it('honors custom skip and take', async () => {
      vi.mocked(prisma.playlist.findMany).mockResolvedValue([] as never);

      await PlaylistRepository.findManyByOwner(OWNER_ID, { skip: 24, take: 12 });

      const arg = vi.mocked(prisma.playlist.findMany).mock.calls[0]?.[0];
      expect(arg?.skip).toBe(24);
      expect(arg?.take).toBe(12);
    });

    it('adds a case-insensitive title filter when search is provided', async () => {
      vi.mocked(prisma.playlist.findMany).mockResolvedValue([] as never);

      await PlaylistRepository.findManyByOwner(OWNER_ID, { search: 'road' });

      const arg = vi.mocked(prisma.playlist.findMany).mock.calls[0]?.[0];
      expect(arg?.where).toEqual({ ownerId: OWNER_ID, title: contains('road') });
    });

    it('omits the title filter when search is absent', async () => {
      vi.mocked(prisma.playlist.findMany).mockResolvedValue([] as never);

      await PlaylistRepository.findManyByOwner(OWNER_ID, {});

      const arg = vi.mocked(prisma.playlist.findMany).mock.calls[0]?.[0];
      expect(arg?.where).toEqual({ ownerId: OWNER_ID });
    });
  });

  describe('update', () => {
    it('updates a playlist by id from the mapped update data', async () => {
      vi.mocked(prisma.playlist.update).mockResolvedValue(mockPlaylist as never);

      const result = await PlaylistRepository.update(PLAYLIST_ID, { title: 'Renamed' });

      expect(result).toEqual(mockPlaylist);
      expect(prisma.playlist.update).toHaveBeenCalledWith({
        where: { id: PLAYLIST_ID },
        data: { title: 'Renamed' },
      });
    });
  });

  describe('delete', () => {
    it('hard-deletes a playlist by id', async () => {
      vi.mocked(prisma.playlist.delete).mockResolvedValue(mockPlaylist as never);

      await PlaylistRepository.delete(PLAYLIST_ID);

      expect(prisma.playlist.delete).toHaveBeenCalledWith({ where: { id: PLAYLIST_ID } });
    });
  });

  describe('findDuplicateItem', () => {
    it('matches on trackFileId when the ref carries a trackFileId', async () => {
      vi.mocked(prisma.playlistItem.findFirst).mockResolvedValue(null);

      await PlaylistRepository.findDuplicateItem(PLAYLIST_ID, { trackFileId: 't'.repeat(24) });

      expect(prisma.playlistItem.findFirst).toHaveBeenCalledWith({
        where: { playlistId: PLAYLIST_ID, trackFileId: 't'.repeat(24) },
      });
    });

    it('matches on videoId when the ref carries a videoId', async () => {
      vi.mocked(prisma.playlistItem.findFirst).mockResolvedValue(null);

      await PlaylistRepository.findDuplicateItem(PLAYLIST_ID, { videoId: 'v'.repeat(24) });

      expect(prisma.playlistItem.findFirst).toHaveBeenCalledWith({
        where: { playlistId: PLAYLIST_ID, videoId: 'v'.repeat(24) },
      });
    });

    it('returns the matched item when found', async () => {
      const existing = { id: ITEM_ID, playlistId: PLAYLIST_ID };
      vi.mocked(prisma.playlistItem.findFirst).mockResolvedValue(existing as never);

      const result = await PlaylistRepository.findDuplicateItem(PLAYLIST_ID, {
        trackFileId: 't'.repeat(24),
      });

      expect(result).toEqual(existing);
    });

    it('returns null without querying when the ref carries neither id', async () => {
      const result = await PlaylistRepository.findDuplicateItem(PLAYLIST_ID, {});

      expect(result).toBeNull();
      expect(prisma.playlistItem.findFirst).not.toHaveBeenCalled();
    });
  });

  describe('addItem', () => {
    it('runs the append in a single transaction', async () => {
      vi.mocked(prisma.playlist.findUnique).mockResolvedValue({ itemCount: 3 } as never);
      vi.mocked(prisma.playlistItem.create).mockResolvedValue({ id: ITEM_ID } as never);
      vi.mocked(prisma.playlist.update).mockResolvedValue(mockPlaylist as never);

      await PlaylistRepository.addItem(PLAYLIST_ID, trackItem);

      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    });

    it('reads the current itemCount to compute the new sortOrder', async () => {
      vi.mocked(prisma.playlist.findUnique).mockResolvedValue({ itemCount: 3 } as never);
      vi.mocked(prisma.playlistItem.create).mockResolvedValue({ id: ITEM_ID } as never);
      vi.mocked(prisma.playlist.update).mockResolvedValue(mockPlaylist as never);

      await PlaylistRepository.addItem(PLAYLIST_ID, trackItem);

      expect(prisma.playlist.findUnique).toHaveBeenCalledWith({
        where: { id: PLAYLIST_ID },
        select: { itemCount: true },
      });
    });

    it('creates the item at sortOrder equal to the current itemCount', async () => {
      vi.mocked(prisma.playlist.findUnique).mockResolvedValue({ itemCount: 3 } as never);
      vi.mocked(prisma.playlistItem.create).mockResolvedValue({ id: ITEM_ID } as never);
      vi.mocked(prisma.playlist.update).mockResolvedValue(mockPlaylist as never);

      await PlaylistRepository.addItem(PLAYLIST_ID, trackItem);

      expect(prisma.playlistItem.create).toHaveBeenCalledWith({
        data: { ...trackItem, playlistId: PLAYLIST_ID, sortOrder: 3 },
      });
    });

    it('increments itemCount by one and totalDuration by the item duration', async () => {
      vi.mocked(prisma.playlist.findUnique).mockResolvedValue({ itemCount: 3 } as never);
      vi.mocked(prisma.playlistItem.create).mockResolvedValue({ id: ITEM_ID } as never);
      vi.mocked(prisma.playlist.update).mockResolvedValue(mockPlaylist as never);

      await PlaylistRepository.addItem(PLAYLIST_ID, trackItem);

      expect(prisma.playlist.update).toHaveBeenCalledWith({
        where: { id: PLAYLIST_ID },
        data: { itemCount: { increment: 1 }, totalDuration: { increment: 180 } },
      });
    });

    it('throws NOT_FOUND when the playlist is missing', async () => {
      vi.mocked(prisma.playlist.findUnique).mockResolvedValue(null);

      await expect(PlaylistRepository.addItem('missing', trackItem)).rejects.toMatchObject({
        code: 'NOT_FOUND',
      });
    });

    it('returns the created item', async () => {
      const created = { id: ITEM_ID, sortOrder: 3 };
      vi.mocked(prisma.playlist.findUnique).mockResolvedValue({ itemCount: 3 } as never);
      vi.mocked(prisma.playlistItem.create).mockResolvedValue(created as never);
      vi.mocked(prisma.playlist.update).mockResolvedValue(mockPlaylist as never);

      const result = await PlaylistRepository.addItem(PLAYLIST_ID, trackItem);

      expect(result).toEqual(created);
    });
  });

  describe('removeItem', () => {
    // 3-item fixture; remove the middle item (sortOrder 1, duration 90).
    const middle = { id: ITEM_ID, sortOrder: 1, duration: 90 };

    it('runs the removal in a single transaction', async () => {
      vi.mocked(prisma.playlistItem.delete).mockResolvedValue(middle as never);
      vi.mocked(prisma.playlist.update).mockResolvedValue(mockPlaylist as never);
      vi.mocked(prisma.playlistItem.updateMany).mockResolvedValue({ count: 1 });

      await PlaylistRepository.removeItem(PLAYLIST_ID, ITEM_ID);

      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    });

    it('deletes the item by id', async () => {
      vi.mocked(prisma.playlistItem.delete).mockResolvedValue(middle as never);
      vi.mocked(prisma.playlist.update).mockResolvedValue(mockPlaylist as never);
      vi.mocked(prisma.playlistItem.updateMany).mockResolvedValue({ count: 1 });

      await PlaylistRepository.removeItem(PLAYLIST_ID, ITEM_ID);

      expect(prisma.playlistItem.delete).toHaveBeenCalledWith({ where: { id: ITEM_ID } });
    });

    it('decrements counters by one and by the removed item duration', async () => {
      vi.mocked(prisma.playlistItem.delete).mockResolvedValue(middle as never);
      vi.mocked(prisma.playlist.update).mockResolvedValue(mockPlaylist as never);
      vi.mocked(prisma.playlistItem.updateMany).mockResolvedValue({ count: 1 });

      await PlaylistRepository.removeItem(PLAYLIST_ID, ITEM_ID);

      expect(prisma.playlist.update).toHaveBeenCalledWith({
        where: { id: PLAYLIST_ID },
        data: { itemCount: { decrement: 1 }, totalDuration: { decrement: 90 } },
      });
    });

    it('compacts sortOrder for items after the removed one', async () => {
      vi.mocked(prisma.playlistItem.delete).mockResolvedValue(middle as never);
      vi.mocked(prisma.playlist.update).mockResolvedValue(mockPlaylist as never);
      vi.mocked(prisma.playlistItem.updateMany).mockResolvedValue({ count: 1 });

      await PlaylistRepository.removeItem(PLAYLIST_ID, ITEM_ID);

      expect(prisma.playlistItem.updateMany).toHaveBeenCalledWith({
        where: { playlistId: PLAYLIST_ID, sortOrder: { gt: 1 } },
        data: { sortOrder: { decrement: 1 } },
      });
    });
  });

  describe('reorderItems', () => {
    it('runs the rewrite in a single transaction', async () => {
      vi.mocked(prisma.playlistItem.update).mockResolvedValue({ id: ITEM_ID } as never);

      await PlaylistRepository.reorderItems(PLAYLIST_ID, ['x', 'y', 'z']);

      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    });

    it('rewrites sortOrder to each id index scoped to the playlist', async () => {
      vi.mocked(prisma.playlistItem.update).mockResolvedValue({ id: ITEM_ID } as never);

      await PlaylistRepository.reorderItems(PLAYLIST_ID, ['x', 'y', 'z']);

      expect(prisma.playlistItem.update).toHaveBeenNthCalledWith(1, {
        where: { id: 'x', playlistId: PLAYLIST_ID },
        data: { sortOrder: 0 },
      });
      expect(prisma.playlistItem.update).toHaveBeenNthCalledWith(2, {
        where: { id: 'y', playlistId: PLAYLIST_ID },
        data: { sortOrder: 1 },
      });
      expect(prisma.playlistItem.update).toHaveBeenNthCalledWith(3, {
        where: { id: 'z', playlistId: PLAYLIST_ID },
        data: { sortOrder: 2 },
      });
    });
  });

  describe('searchPublicTrackItems', () => {
    it('finds public track items excluding the caller, ordered and limited', async () => {
      vi.mocked(prisma.playlistItem.findMany).mockResolvedValue([] as never);

      await PlaylistRepository.searchPublicTrackItems('song', OTHER_OWNER_ID, 8);

      expect(prisma.playlistItem.findMany).toHaveBeenCalledWith({
        where: {
          itemType: 'track',
          title: { contains: 'song', mode: 'insensitive' },
          playlist: { is: { isPublic: true, ownerId: { not: OTHER_OWNER_ID } } },
        },
        include: { playlist: { select: { id: true, title: true } } },
        take: 8,
      });
    });

    it('returns the matched rows', async () => {
      const rows = [{ id: ITEM_ID, playlist: { id: PLAYLIST_ID, title: 'Mix' } }];
      vi.mocked(prisma.playlistItem.findMany).mockResolvedValue(rows as never);

      const result = await PlaylistRepository.searchPublicTrackItems('song', OTHER_OWNER_ID, 8);

      expect(result).toEqual(rows);
    });
  });
});
