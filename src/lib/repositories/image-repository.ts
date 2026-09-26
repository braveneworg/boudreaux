/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import 'server-only';

import { prisma } from '@/lib/prisma';
import type { CreateImageData, ImageOwnerWhere, ImageRecord } from '@/lib/types/domain/image';

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
 * vendor-neutral `DataError`s. Sort-order computation stays in the calling service.
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
}
