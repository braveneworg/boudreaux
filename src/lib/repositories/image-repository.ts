/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import 'server-only';

import { prisma } from '@/lib/prisma';

import type { Image, Prisma } from '@prisma/client';

/** Owner scoping for an image — exactly one of artistId/releaseId is provided. */
export type ImageOwnerWhere = { artistId: string } | { releaseId: string };

/**
 * Data-access layer for the general Image model.
 *
 * Encapsulates every Prisma call for images owned by artists or releases so
 * services never talk to Prisma directly. Methods return RAW Prisma results;
 * sort-order computation, S3 side effects, and ServiceResponse wrapping stay in
 * the calling service.
 */
export class ImageRepository {
  /**
   * Find images for a single owner (artist or release) with a caller-supplied
   * select projection. Used to count existing rows when seeding sortOrder.
   */
  static async findManyByOwner(
    owner: ImageOwnerWhere,
    select: Prisma.ImageSelect
  ): Promise<Partial<Image>[]> {
    return prisma.image.findMany({
      where: owner,
      select,
    }) as Promise<Partial<Image>[]>;
  }

  /** Create a single image row from the supplied (unchecked) create data. */
  static async create(data: Prisma.ImageUncheckedCreateInput): Promise<Image> {
    return prisma.image.create({ data });
  }

  /** Find a single image by id with a caller-supplied select projection. */
  static async findUniqueById(
    id: string,
    select: Prisma.ImageSelect
  ): Promise<Partial<Image> | null> {
    return prisma.image.findUnique({
      where: { id },
      select,
    }) as Promise<Partial<Image> | null>;
  }

  /** Find all images for an artist, ordered by sortOrder ascending. */
  static async findManyByArtist(artistId: string): Promise<Image[]> {
    return prisma.image.findMany({
      where: { artistId },
      orderBy: { sortOrder: 'asc' },
    });
  }

  /**
   * Find the (id-only) images belonging to an artist whose ids are in the
   * supplied list. Used to verify ownership before a reorder.
   */
  static async findManyByArtistAndIds(
    artistId: string,
    ids: string[]
  ): Promise<Pick<Image, 'id'>[]> {
    return prisma.image.findMany({
      where: { artistId, id: { in: ids } },
      select: { id: true },
    });
  }

  /** Update an image's caption/altText (and any other supplied scalar fields). */
  static async update(id: string, data: Prisma.ImageUpdateInput): Promise<Image> {
    return prisma.image.update({
      where: { id },
      data,
    });
  }

  /** Update a single image's sortOrder. Used by the reorder operation. */
  static async updateSortOrder(id: string, sortOrder: number): Promise<Image> {
    return prisma.image.update({
      where: { id },
      data: { sortOrder },
    });
  }

  /** Hard-delete an image row by id. */
  static async delete(id: string): Promise<Image> {
    return prisma.image.delete({
      where: { id },
    });
  }
}
