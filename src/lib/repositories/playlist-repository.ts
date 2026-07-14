/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import 'server-only';

import { Prisma } from '@prisma/client';

import { prisma } from '@/lib/prisma';
import type {
  AddPlaylistItemData,
  CreatePlaylistData,
  PlaylistItemRecord,
  PlaylistItemType,
  PlaylistRecord,
  UpdatePlaylistData,
} from '@/lib/types/domain/playlist';

import { runQuery } from './_internal/map-prisma-error';

import type { AssertExact, AssertExtends } from './_internal/drift';

// =============================================================================
// Drift guards (hand-written domain types vs the Prisma scalar payloads)
// =============================================================================

// Fails `pnpm run typecheck` if the hand-written `PlaylistRecord` drifts from
// the Prisma `Playlist` scalar payload (no relations).
type _PlaylistDrift = AssertExact<PlaylistRecord, Prisma.PlaylistGetPayload<Record<string, never>>>;
const _playlistDrift: _PlaylistDrift = true;

// `PlaylistItemRecord.itemType` deliberately narrows Prisma's `string` column to
// the `'track' | 'video'` union (the schema stores it as a bare string). The
// guard is one-directional — every field of the record must remain assignable
// to the Prisma payload — and `toItemRecord` re-narrows the string on read.
type _PlaylistItemDrift = AssertExtends<
  PlaylistItemRecord,
  Prisma.PlaylistItemGetPayload<Record<string, never>>
>;
const _playlistItemDrift: _PlaylistItemDrift = true;

// =============================================================================
// Translators (domain input -> Prisma input; the return type is the drift guard)
// =============================================================================

/**
 * Build a Prisma create payload from domain create data. Uses the unchecked
 * input so the `ownerId` foreign key passes through as a scalar (the domain
 * type carries the id, not a nested relation).
 */
const toPrismaCreate = (data: CreatePlaylistData): Prisma.PlaylistUncheckedCreateInput => ({
  ...data,
});

/** Build a Prisma update payload from domain update data. */
const toPrismaUpdate = (data: UpdatePlaylistData): Prisma.PlaylistUpdateInput => ({ ...data });

/**
 * Narrow a raw Prisma item row (whose `itemType` is a bare `string`) back to the
 * domain record whose `itemType` is the `'track' | 'video'` union. The value is
 * only ever written by this repository, so the cast is sound by construction.
 */
const toItemRecord = (
  row: Prisma.PlaylistItemGetPayload<Record<string, never>>
): PlaylistItemRecord => ({
  ...row,
  itemType: row.itemType as PlaylistItemType,
});

/** Sum the durations across an item batch (seconds). */
const sumDurations = (items: AddPlaylistItemData[]): number =>
  items.reduce((total, { duration }) => total + duration, 0);

/**
 * Data-access layer for the `Playlist` and `PlaylistItem` models. The only layer
 * that touches Prisma for playlists: it owns the where DSL, keeps the
 * denormalized `itemCount`/`totalDuration` counters and dense `sortOrder`
 * consistent inside `$transaction`s, and wraps every call in `runQuery` so
 * callers see vendor-neutral `DataError`s and hand-written domain types.
 */
export class PlaylistRepository {
  /** Create an empty playlist from domain create data. */
  static async create(data: CreatePlaylistData): Promise<PlaylistRecord> {
    return runQuery(() => prisma.playlist.create({ data: toPrismaCreate(data) }));
  }

  /**
   * Create a playlist and seed its items in one transaction: insert the playlist,
   * bulk-insert the items with dense `sortOrder = index`, then set the
   * denormalized `itemCount`/`totalDuration` from the batch. Returns the playlist.
   */
  static async createWithItems(
    data: CreatePlaylistData,
    items: AddPlaylistItemData[]
  ): Promise<PlaylistRecord> {
    return runQuery(() =>
      prisma.$transaction(async (tx) => {
        const playlist = await tx.playlist.create({ data: toPrismaCreate(data) });
        if (items.length > 0) {
          await tx.playlistItem.createMany({
            data: items.map((item, index) => ({
              ...item,
              playlistId: playlist.id,
              sortOrder: index,
            })),
          });
        }
        await tx.playlist.update({
          where: { id: playlist.id },
          data: { itemCount: items.length, totalDuration: sumDurations(items) },
        });
        return playlist;
      })
    );
  }

  /** Find a playlist by id. Returns `null` when not found. */
  static async findById(id: string): Promise<PlaylistRecord | null> {
    return runQuery(() => prisma.playlist.findUnique({ where: { id } }));
  }

  /**
   * Find a playlist by id with its items eagerly loaded, ordered by dense
   * `sortOrder` ascending. Returns `null` when the playlist is not found.
   */
  static async findByIdWithItems(
    id: string
  ): Promise<(PlaylistRecord & { items: PlaylistItemRecord[] }) | null> {
    const playlist = await runQuery(() =>
      prisma.playlist.findUnique({
        where: { id },
        include: { items: { orderBy: { sortOrder: 'asc' } } },
      })
    );
    if (!playlist) return null;
    const { items, ...scalars } = playlist;
    return { ...scalars, items: items.map(toItemRecord) };
  }

  /**
   * List a page of an owner's playlists, newest-touched first (`updatedAt`
   * desc). An optional `search` narrows by case-insensitive title match.
   * Defaults: skip 0, take 24.
   */
  static async findManyByOwner(
    ownerId: string,
    { skip = 0, take = 24, search }: { skip?: number; take?: number; search?: string }
  ): Promise<PlaylistRecord[]> {
    const where: Prisma.PlaylistWhereInput = {
      ownerId,
      ...(search ? { title: { contains: search, mode: 'insensitive' } } : {}),
    };
    return runQuery(() =>
      prisma.playlist.findMany({ where, orderBy: { updatedAt: 'desc' }, skip, take })
    );
  }

  /** Update a playlist by id from domain update data. */
  static async update(id: string, data: UpdatePlaylistData): Promise<PlaylistRecord> {
    return runQuery(() => prisma.playlist.update({ where: { id }, data: toPrismaUpdate(data) }));
  }

  /** Hard-delete a playlist by id; its items cascade-delete with it. */
  static async delete(id: string): Promise<void> {
    await runQuery(() => prisma.playlist.delete({ where: { id } }));
  }

  /**
   * Find an existing item in the playlist that references the same source track
   * or video. The lookup column is chosen from whichever id the `ref` carries.
   * Returns `null` when the ref carries neither id or no match exists.
   */
  static async findDuplicateItem(
    playlistId: string,
    ref: { trackFileId?: string; videoId?: string }
  ): Promise<PlaylistItemRecord | null> {
    const sourceFilter: Prisma.PlaylistItemWhereInput | null = ref.trackFileId
      ? { trackFileId: ref.trackFileId }
      : ref.videoId
        ? { videoId: ref.videoId }
        : null;
    if (!sourceFilter) return null;
    const row = await runQuery(() =>
      prisma.playlistItem.findFirst({ where: { playlistId, ...sourceFilter } })
    );
    return row ? toItemRecord(row) : null;
  }

  /**
   * Append an item to the tail of a playlist in one transaction: read the current
   * `itemCount`, create the item at `sortOrder = itemCount`, then bump the
   * denormalized counters. Throws `DataError('NOT_FOUND')` if the playlist is gone.
   */
  static async addItem(playlistId: string, data: AddPlaylistItemData): Promise<PlaylistItemRecord> {
    const row = await runQuery(() =>
      prisma.$transaction(async (tx) => {
        const playlist = await tx.playlist.findUnique({
          where: { id: playlistId },
          select: { itemCount: true },
        });
        if (!playlist) {
          throw new Prisma.PrismaClientKnownRequestError('Playlist not found', {
            code: 'P2025',
            clientVersion: Prisma.prismaVersion.client,
          });
        }
        const created = await tx.playlistItem.create({
          data: { ...data, playlistId, sortOrder: playlist.itemCount },
        });
        await tx.playlist.update({
          where: { id: playlistId },
          data: { itemCount: { increment: 1 }, totalDuration: { increment: data.duration } },
        });
        return created;
      })
    );
    return toItemRecord(row);
  }

  /**
   * Remove an item in one transaction: delete it, decrement the denormalized
   * counters by the removed item's duration, then compact the dense `sortOrder`
   * of every following item down by one so the range stays gap-free.
   */
  static async removeItem(playlistId: string, itemId: string): Promise<void> {
    await runQuery(() =>
      prisma.$transaction(async (tx) => {
        const removed = await tx.playlistItem.delete({ where: { id: itemId } });
        await tx.playlist.update({
          where: { id: playlistId },
          data: { itemCount: { decrement: 1 }, totalDuration: { decrement: removed.duration } },
        });
        await tx.playlistItem.updateMany({
          where: { playlistId, sortOrder: { gt: removed.sortOrder } },
          data: { sortOrder: { decrement: 1 } },
        });
      })
    );
  }

  /**
   * Rewrite the dense `sortOrder` of the playlist's items to match the given id
   * order (index position) in one transaction. Each update is scoped to the
   * playlist so a stray id can never touch another owner's items.
   */
  static async reorderItems(playlistId: string, orderedItemIds: string[]): Promise<void> {
    await runQuery(() =>
      prisma.$transaction(async (tx) => {
        for (const [index, id] of orderedItemIds.entries()) {
          await tx.playlistItem.update({
            where: { id, playlistId },
            data: { sortOrder: index },
          });
        }
      })
    );
  }

  /**
   * Search public playlists' track items by case-insensitive title, excluding
   * the caller's own playlists. Each row carries its parent playlist's id/title
   * for attribution. Capped at `take`.
   */
  static async searchPublicTrackItems(
    q: string,
    excludeOwnerId: string,
    take: number
  ): Promise<Array<PlaylistItemRecord & { playlist: { id: string; title: string } }>> {
    const rows = await runQuery(() =>
      prisma.playlistItem.findMany({
        where: {
          itemType: 'track',
          title: { contains: q, mode: 'insensitive' },
          playlist: { is: { isPublic: true, ownerId: { not: excludeOwnerId } } },
        },
        include: { playlist: { select: { id: true, title: true } } },
        take,
      })
    );
    return rows.map(({ playlist, ...item }) => ({ ...toItemRecord(item), playlist }));
  }
}
