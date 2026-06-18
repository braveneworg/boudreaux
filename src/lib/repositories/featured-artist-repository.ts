/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import 'server-only';

import { prisma } from '@/lib/prisma';

import type { Prisma } from '@prisma/client';

/**
 * Prisma include configuration for featured artist queries with all relations.
 * Shared across every read/write so the returned shape always matches the
 * `FeaturedArtist` payload type consumed by the service and its Zod schemas.
 */
export const featuredArtistInclude = {
  // Project to only the fields the carousel/player and the display-name and
  // cover-art utils actually read — full Artist documents are large (bio,
  // notes[], addresses, …) and were shipped wholesale. `release.artistReleases`
  // (a 4th relation-fetch level — Prisma/MongoDB issues one query per relation
  // edge) is intentionally dropped: it only fed a third-priority display-name
  // fallback for records with no `displayName` and no connected `artists[]`.
  artists: {
    select: {
      id: true,
      displayName: true,
      firstName: true,
      surname: true,
      slug: true,
      images: { select: { src: true } },
    },
  },
  digitalFormat: {
    include: {
      files: {
        orderBy: { trackNumber: 'asc' as const },
      },
    },
  },
  release: {
    select: {
      id: true,
      title: true,
      coverArt: true,
      images: { select: { src: true } },
    },
  },
} satisfies Prisma.FeaturedArtistInclude;

export interface FindAllParams {
  where: Prisma.FeaturedArtistWhereInput;
  skip: number;
  take: number;
}

/**
 * Data-access layer for the FeaturedArtist model. All Prisma access for the
 * featured-artists feature lives here; returns raw Prisma results. Business
 * logic, validation, and error wrapping remain in `FeaturedArtistsService`.
 */
export class FeaturedArtistRepository {
  /** Create a featured artist, returning it with all relations included. */
  static async create(data: Prisma.FeaturedArtistCreateInput) {
    return prisma.featuredArtist.create({
      data,
      include: featuredArtistInclude,
    });
  }

  /**
   * Find featured artists currently visible on `currentDate` (published, within
   * the featured window), newest first, capped at `take`.
   */
  static async findFeatured(currentDate: Date, take: number) {
    return prisma.featuredArtist.findMany({
      where: {
        publishedOn: { not: null },
        featuredOn: {
          lte: currentDate,
        },
        OR: [
          { featuredUntil: null },
          { featuredUntil: { isSet: false } },
          { featuredUntil: { gte: currentDate } },
        ],
      },
      include: featuredArtistInclude,
      orderBy: {
        featuredOn: 'desc',
      },
      take,
    });
  }

  /**
   * Find featured artists for the admin list using a caller-built `where`,
   * with skip/take pagination, ordered by position then featured date.
   */
  static async findAll({ where, skip, take }: FindAllParams) {
    return prisma.featuredArtist.findMany({
      where,
      skip,
      take,
      orderBy: [{ position: 'asc' }, { featuredOn: 'desc' }],
      include: featuredArtistInclude,
    });
  }

  /** Find a single featured artist by id, or `null` if it does not exist. */
  static async findById(id: string) {
    return prisma.featuredArtist.findUnique({
      where: { id },
      include: featuredArtistInclude,
    });
  }

  /** Update a featured artist by id, returning it with all relations included. */
  static async update(id: string, data: Prisma.FeaturedArtistUpdateInput) {
    return prisma.featuredArtist.update({
      where: { id },
      data,
      include: featuredArtistInclude,
    });
  }

  /** Hard-delete a featured artist by id, returning the deleted record. */
  static async delete(id: string) {
    return prisma.featuredArtist.delete({
      where: { id },
      include: featuredArtistInclude,
    });
  }
}
