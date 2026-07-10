/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import 'server-only';

import { prisma } from '@/lib/prisma';
import type {
  CreateVideoData,
  UpdateVideoData,
  Video,
  VideoCountFilters,
  VideoListFilters,
} from '@/lib/types/domain/video';

import { runQuery } from './_internal/map-prisma-error';

import type { AssertExact } from './_internal/drift';
import type { Prisma } from '@prisma/client';

// =============================================================================
// Drift guard (hand-written domain type vs the Prisma scalar payload)
// =============================================================================

// Fails `pnpm run typecheck` if the hand-written `Video` domain type drifts from
// the Prisma `Video` scalar payload (no relations).
type _VideoDrift = AssertExact<Video, Prisma.VideoGetPayload<Record<string, never>>>;
const _videoDrift: _VideoDrift = true;

// =============================================================================
// Translators (domain input -> Prisma input; the return type is the drift guard)
// =============================================================================

/** Build a Prisma create payload from domain create data. */
const toPrismaCreate = (data: CreateVideoData): Prisma.VideoCreateInput => ({ ...data });

/** Build a Prisma update payload from domain update data. */
const toPrismaUpdate = (data: UpdateVideoData): Prisma.VideoUpdateInput => ({ ...data });

// =============================================================================
// Where builder (domain filters -> Prisma where; owned by the repository)
// =============================================================================

const containsInsensitive = (value: string) => ({ contains: value, mode: 'insensitive' as const });

/**
 * Build the admin-listing `where` from domain filters. The archived, published,
 * and search clauses are combined under `AND` so their `OR` keys never collide
 * (Prisma 6 + MongoDB null-safe pattern). `archived` absent/false excludes
 * archived rows (null-safe OR); `archived: true` is an exclusive archived-only
 * view. `published` true/false narrows to published/unpublished; null/absent
 * adds no publish clause.
 */
const buildListWhere = (filters: VideoListFilters): Prisma.VideoWhereInput => {
  const { search, published, archived } = filters;
  const and: Prisma.VideoWhereInput[] = [];

  if (archived) {
    and.push({ archivedAt: { not: null } });
  } else {
    and.push({ OR: [{ archivedAt: null }, { archivedAt: { isSet: false } }] });
  }
  if (published === true) {
    and.push({ publishedAt: { not: null } });
  } else if (published === false) {
    and.push({ OR: [{ publishedAt: null }, { publishedAt: { isSet: false } }] });
  }
  if (search) {
    and.push({
      OR: [
        { title: containsInsensitive(search) },
        { artist: containsInsensitive(search) },
        { description: containsInsensitive(search) },
      ],
    });
  }

  return { AND: and };
};

/**
 * Data-access layer for the `Video` model. The only layer that touches Prisma
 * for videos: it owns the where DSL, translates domain input to Prisma input,
 * and wraps every call in `runQuery` so callers see vendor-neutral `DataError`s
 * and hand-written domain types.
 */
export class VideoRepository {
  /** Create a new video from domain create data. */
  static async create(data: CreateVideoData): Promise<Video> {
    return runQuery(() => prisma.video.create({ data: toPrismaCreate(data) }));
  }

  /** Find a video by id. Returns `null` when not found. */
  static async findById(id: string): Promise<Video | null> {
    return runQuery(() => prisma.video.findUnique({ where: { id } }));
  }

  /**
   * Find many videos for the admin listing, building the `where` from the full
   * domain filter set. Ordered by `releasedOn` (default desc). Defaults: skip 0,
   * take 5.
   */
  static async findMany(filters: VideoListFilters): Promise<Video[]> {
    const { sort = 'desc', skip = 0, take = 5 } = filters;
    return runQuery(() =>
      prisma.video.findMany({
        where: buildListWhere(filters),
        orderBy: { releasedOn: sort },
        skip,
        take,
      })
    );
  }

  /**
   * Fetch a page of published, non-archived videos for the public `/videos`
   * listing. Ordered by `releasedOn` (default desc). Defaults: skip 0, take 5.
   */
  static async findPublished(
    filters: Pick<VideoListFilters, 'sort' | 'skip' | 'take'>
  ): Promise<Video[]> {
    const { sort = 'desc', skip = 0, take = 5 } = filters;
    return runQuery(() =>
      prisma.video.findMany({
        where: buildListWhere({ published: true }),
        orderBy: { releasedOn: sort },
        skip,
        take,
      })
    );
  }

  /** Count videos matching an optional published filter (admin dashboard). */
  static async count(filters: VideoCountFilters = {}): Promise<number> {
    const where: Prisma.VideoWhereInput =
      filters.published === true
        ? { publishedAt: { not: null } }
        : filters.published === false
          ? { OR: [{ publishedAt: null }, { publishedAt: { isSet: false } }] }
          : {};
    return runQuery(() => prisma.video.count({ where }));
  }

  /**
   * Update a video by id from domain update data. The publish/unpublish and
   * archive/restore flows all pass through this by setting `publishedAt` /
   * `archivedAt`.
   */
  static async update(id: string, data: UpdateVideoData): Promise<Video> {
    return runQuery(() => prisma.video.update({ where: { id }, data: toPrismaUpdate(data) }));
  }

  /** Hard-delete a video by id. */
  static async delete(id: string): Promise<Video> {
    return runQuery(() => prisma.video.delete({ where: { id } }));
  }
}
