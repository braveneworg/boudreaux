/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import 'server-only';

import { prisma } from '@/lib/prisma';
import type {
  CreateImageData,
  ImageOwnerWhere,
  ImageRecord,
  UpdateImageData,
} from '@/lib/types/domain/image';

import { runQuery } from './_internal/map-prisma-error';

import type { AssertExact } from './_internal/drift';
import type { Prisma } from '@prisma/client';

export type { ImageOwnerWhere } from '@/lib/types/domain/image';

// Drift guard: fail typecheck if ImageRecord diverges from the Prisma payload.
type _ImageDrift = AssertExact<ImageRecord, Prisma.ImageGetPayload<object>>;
const _imageDrift: _ImageDrift = true;

/** Build a Prisma create payload from domain create data. */
const toPrismaCreate = (data: CreateImageData): Prisma.ImageUncheckedCreateInput => ({ ...data });

/**
 * Data-access layer for the general Image model. The only layer that touches
 * Prisma for images: it owns the query shapes, translates domain input, and
 * wraps every call in `runQuery` so callers see hand-written domain types and
 * vendor-neutral `DataError`s. Sort-order computation, S3 side effects, and
 * ServiceResponse wrapping stay in the calling service.
 */
export class ImageRepository {
  /** Find the (id-only) images for a single owner. Used to seed sortOrder. */
  static async findManyByOwner(owner: ImageOwnerWhere): Promise<Array<{ id: string }>> {
    return runQuery(() => prisma.image.findMany({ where: owner, select: { id: true } }));
  }

  /** Create a single image row from the supplied create data. */
  static async create(data: CreateImageData): Promise<ImageRecord> {
    return runQuery(() => prisma.image.create({ data: toPrismaCreate(data) }));
  }

  /** Find a single image by id (all scalar fields). */
  static async findUniqueById(id: string): Promise<ImageRecord | null> {
    return runQuery(() => prisma.image.findUnique({ where: { id } }));
  }

  /** Find all images for an artist, ordered by sortOrder ascending. */
  static async findManyByArtist(artistId: string): Promise<ImageRecord[]> {
    return runQuery(() =>
      prisma.image.findMany({ where: { artistId }, orderBy: { sortOrder: 'asc' } })
    );
  }

  /**
   * Find the (id-only) images belonging to an artist whose ids are in the
   * supplied list. Used to verify ownership before a reorder.
   */
  static async findManyByArtistAndIds(
    artistId: string,
    ids: string[]
  ): Promise<Array<{ id: string }>> {
    return runQuery(() =>
      prisma.image.findMany({ where: { artistId, id: { in: ids } }, select: { id: true } })
    );
  }

  /** Update an image's caption/altText (and any other supplied scalar fields). */
  static async update(id: string, data: UpdateImageData): Promise<ImageRecord> {
    return runQuery(() => prisma.image.update({ where: { id }, data }));
  }

  /** Update a single image's sortOrder. Used by the reorder operation. */
  static async updateSortOrder(id: string, sortOrder: number): Promise<ImageRecord> {
    return runQuery(() => prisma.image.update({ where: { id }, data: { sortOrder } }));
  }

  /** Hard-delete an image row by id. */
  static async delete(id: string): Promise<ImageRecord> {
    return runQuery(() => prisma.image.delete({ where: { id } }));
  }
}
