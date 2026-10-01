/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import 'server-only';

import { prisma } from '@/lib/prisma';
import type {
  CreateImageData,
  ImageListingRecord,
  ImageOwnerWhere,
  ImageRecord,
  ImageSourceRecord,
  UpdateImageMetadataData,
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
 * returns hand-written domain types; failures surface as vendor-neutral
 * `DataError`s. Sort-order computation stays in the calling service.
 */
export class ImageRepository {
  /** Find the (id-only) images for a single owner. Used to seed sortOrder. */
  static async findManyByOwner(owner: ImageOwnerWhere): Promise<Array<{ id: string }>> {
    return prisma.image.findMany({ where: owner, select: { id: true } });
  }

  /** Create a single image row from the supplied create data. */
  static async create(data: CreateImageData): Promise<ImageRecord> {
    return prisma.image.create({ data: toPrismaCreate(data) });
  }

  /** The id, source URL, and owning release of one image — what a delete needs. */
  static async findSourceById(id: string): Promise<ImageSourceRecord | null> {
    return prisma.image.findUnique({
      where: { id },
      select: { id: true, src: true, releaseId: true },
    });
  }

  /** Delete one image row by id. */
  static async delete(id: string): Promise<void> {
    await prisma.image.delete({ where: { id } });
  }

  /** A release's images in display order, projected for listing. */
  static async findListingByRelease(releaseId: string): Promise<ImageListingRecord[]> {
    return prisma.image.findMany({
      where: { releaseId },
      orderBy: { sortOrder: 'asc' },
      select: { id: true, src: true, caption: true, altText: true, sortOrder: true },
    });
  }

  /** Update an image's caption and alt text. */
  static async updateMetadata(id: string, data: UpdateImageMetadataData): Promise<void> {
    await prisma.image.update({ where: { id }, data: { ...data } });
  }

  /**
   * Set each image's `sortOrder` to its index in `imageIds`, in one transaction
   * so a failure leaves the previous order intact.
   */
  static async reorder(imageIds: string[]): Promise<void> {
    await runQuery(() =>
      prisma.$transaction(
        imageIds.map((id, index) =>
          prisma.image.update({ where: { id }, data: { sortOrder: index } })
        )
      )
    );
  }
}
