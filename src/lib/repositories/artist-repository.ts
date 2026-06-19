/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import 'server-only';

import { prisma } from '@/lib/prisma';
import {
  artistWithPublishedReleasesInclude,
  type Artist,
  type ArtistWithPublishedReleases,
} from '@/lib/types/media-models';

import type { Artist as PrismaArtist, Prisma } from '@prisma/client';

/** Pagination + filter args shared by the admin and public artist listings. */
export interface ArtistFindManyParams {
  where: Prisma.ArtistWhereInput;
  skip: number;
  take: number;
}

/** The narrowed projection used by the find-or-create-by-name flow. */
export type ArtistNameSelect = {
  id: true;
  displayName: true;
  firstName: true;
  surname: true;
};

/** Result of a name-projection lookup. */
export type ArtistNameRecord = {
  id: string;
  displayName: string | null;
  firstName: string;
  surname: string;
};

/**
 * Data-access layer for the Artist and ArtistRelease models.
 *
 * Encapsulates every Prisma call for artists so the ArtistService keeps only
 * Zod validation, business logic, and ServiceResponse wrapping. Where/include
 * shapes are preserved exactly as the service previously issued them so the
 * response payloads continue to satisfy the admin/public Zod schemas.
 */
export class ArtistRepository {
  /** Create a new artist. */
  static async create(data: Prisma.ArtistCreateInput): Promise<PrismaArtist> {
    return prisma.artist.create({ data });
  }

  /** Find an artist by id, including images ordered by sortOrder. */
  static async findById(id: string): Promise<Artist | null> {
    return prisma.artist.findUnique({
      where: { id },
      include: {
        images: {
          orderBy: { sortOrder: 'asc' },
        },
      },
    }) as Promise<Artist | null>;
  }

  /** Find an artist by slug (no relations). */
  static async findBySlug(slug: string): Promise<PrismaArtist | null> {
    return prisma.artist.findUnique({ where: { slug } });
  }

  /**
   * List artists for the admin listing with the full include shape required by
   * `artistSchema` (images take 3, labels, urls, releases → release).
   */
  static async findMany({ where, skip, take }: ArtistFindManyParams): Promise<Artist[]> {
    return prisma.artist.findMany({
      where,
      skip,
      take,
      orderBy: { createdAt: 'desc' },
      include: {
        images: {
          orderBy: { sortOrder: 'asc' },
          take: 3,
        },
        labels: true,
        urls: true,
        releases: {
          include: { release: true },
        },
      },
    }) as Promise<Artist[]>;
  }

  /** Count artists matching an optional filter (used by the admin dashboard). */
  static async count(where: Prisma.ArtistWhereInput = {}): Promise<number> {
    return prisma.artist.count({ where });
  }

  /** Update an artist by id. */
  static async update(id: string, data: Prisma.ArtistUpdateInput): Promise<PrismaArtist> {
    return prisma.artist.update({ where: { id }, data });
  }

  /** Hard-delete an artist by id. */
  static async delete(id: string): Promise<PrismaArtist> {
    return prisma.artist.delete({ where: { id } });
  }

  /** Soft-delete (archive) an artist by setting deletedOn to now. */
  static async archive(id: string): Promise<PrismaArtist> {
    return prisma.artist.update({
      where: { id },
      data: { deletedOn: new Date() },
    });
  }

  /** Lightweight existence check returning only the id (or null). */
  static async existsById(artistId: string): Promise<Pick<PrismaArtist, 'id'> | null> {
    return prisma.artist.findUnique({
      where: { id: artistId },
      select: { id: true },
    });
  }

  /**
   * List active, published artists for the public search feature, with the
   * lightweight images/releases include the search UI consumes.
   */
  static async searchPublished({ where, skip, take }: ArtistFindManyParams): Promise<Artist[]> {
    return prisma.artist.findMany({
      where,
      skip,
      take,
      orderBy: { displayName: 'asc' },
      include: {
        images: {
          orderBy: { sortOrder: 'asc' },
          take: 1,
        },
        releases: {
          include: {
            release: {
              select: { id: true, title: true, publishedAt: true, deletedOn: true },
            },
          },
        },
      },
    }) as Promise<Artist[]>;
  }

  /**
   * Find a single active, published artist (by the caller's where clause) with
   * the full nested release + digital-format include used on the public detail
   * page. The service still post-filters releases to published, non-deleted.
   */
  static async findBySlugWithReleases(
    where: Prisma.ArtistWhereInput
  ): Promise<ArtistWithPublishedReleases | null> {
    return prisma.artist.findFirst({
      where,
      include: artistWithPublishedReleasesInclude,
    });
  }

  /** Find an artist by slug returning the name projection (find-or-create flow). */
  static async findUniqueBySlug(
    slug: string,
    select: ArtistNameSelect
  ): Promise<ArtistNameRecord | null> {
    return prisma.artist.findUnique({
      where: { slug },
      select,
    }) as Promise<ArtistNameRecord | null>;
  }

  /** Case-insensitive displayName lookup returning the name projection. */
  static async findFirstByDisplayName(
    displayName: string,
    select: ArtistNameSelect
  ): Promise<ArtistNameRecord | null> {
    return prisma.artist.findFirst({
      where: { displayName: { equals: displayName, mode: 'insensitive' } },
      select,
    }) as Promise<ArtistNameRecord | null>;
  }

  /** Case-insensitive firstName + surname lookup returning the name projection. */
  static async findFirstByName(
    firstName: string,
    surname: string,
    select: ArtistNameSelect
  ): Promise<ArtistNameRecord | null> {
    return prisma.artist.findFirst({
      where: {
        AND: [
          { firstName: { equals: firstName, mode: 'insensitive' } },
          { surname: { equals: surname, mode: 'insensitive' } },
        ],
      },
      select,
    }) as Promise<ArtistNameRecord | null>;
  }

  /** Create an artist returning only the name projection (find-or-create flow). */
  static async createWithSelect(
    data: Prisma.ArtistCreateInput,
    select: ArtistNameSelect
  ): Promise<ArtistNameRecord> {
    return prisma.artist.create({
      data,
      select,
    }) as Promise<ArtistNameRecord>;
  }

  /**
   * Idempotently connect an artist to a release via the ArtistRelease join
   * table. Uses upsert to avoid duplicate constraint violations.
   */
  static async connectToRelease(artistId: string, releaseId: string): Promise<void> {
    await prisma.artistRelease.upsert({
      where: {
        artistId_releaseId: { artistId, releaseId },
      },
      update: {},
      create: { artistId, releaseId },
    });
  }
}
