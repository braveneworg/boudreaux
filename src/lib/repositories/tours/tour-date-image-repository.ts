/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import 'server-only';

import { prisma } from '@/lib/prisma';
import type { TourDateImageScalars } from '@/lib/types/tours';

import { runQuery } from '../_internal/map-prisma-error';
import { retryOnWriteConflict } from '../_internal/write-conflict';

import type { AssertExact } from '../_internal/drift';
import type { Prisma } from '@prisma/client';

export interface CreateTourDateImageInput {
  tourDateId: string;
  s3Key: string;
  s3Url: string;
  s3Bucket: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
  altText?: string;
  uploadedBy?: string;
}

export interface TourDateImageOrderUpdate {
  id: string;
  displayOrder: number;
}

/**
 * How many confirms may race on one owner before the last is refused with a
 * conflict rather than an answer. Two admins (or two tabs) is the case that
 * happens; the margin covers more.
 */
const CONFIRM_ATTEMPTS = 5;

// Compile-time drift guard: fail `pnpm run typecheck` if the hand-written
// `TourDateImageScalars` diverges from the Prisma tour-date-image model scalars.
type _TourDateImageDrift = AssertExact<
  TourDateImageScalars,
  Prisma.TourDateImageGetPayload<Record<never, never>>
>;
const _tourDateImageDrift: _TourDateImageDrift = true;

/**
 * Repository for tour date image database operations. The only layer that
 * touches Prisma for tour-date images: it returns hand-written, Prisma-free
 * domain types.
 */
export class TourDateImageRepository {
  /**
   * Find all images for a tour date, sorted by display order.
   */
  static async findByTourDateId(tourDateId: string): Promise<TourDateImageScalars[]> {
    return prisma.tourDateImage.findMany({
      where: { tourDateId },
      orderBy: { displayOrder: 'asc' },
    });
  }

  /**
   * Find a single image by ID.
   */
  static async findById(id: string): Promise<TourDateImageScalars | null> {
    return prisma.tourDateImage.findUnique({
      where: { id },
    });
  }

  /**
   * Record a new image as the tour date's last, unless it already holds
   * `maxImages`: null then, and nothing is written. The count and the insert
   * run in one transaction that first writes the tour date's own document,
   * so two confirms for one tour date cannot both count under the cap: the
   * second to write the document loses a write conflict, runs again, and
   * counts the first one's image. A tour date that does not exist fails
   * `NOT_FOUND` instead of gaining an orphaned image.
   */
  static async createWithinCap(
    data: CreateTourDateImageInput,
    maxImages: number
  ): Promise<TourDateImageScalars | null> {
    return retryOnWriteConflict(
      () =>
        runQuery(() =>
          prisma.$transaction(async (tx) => {
            await tx.tourDate.update({
              where: { id: data.tourDateId },
              data: { updatedAt: new Date() },
            });
            const displayOrder = await tx.tourDateImage.count({
              where: { tourDateId: data.tourDateId },
            });
            if (displayOrder >= maxImages) {
              return null;
            }
            return tx.tourDateImage.create({ data: { ...data, displayOrder } });
          })
        ),
      CONFIRM_ATTEMPTS
    );
  }

  /**
   * Delete an image by ID.
   */
  static async delete(id: string): Promise<TourDateImageScalars> {
    return prisma.tourDateImage.delete({
      where: { id },
    });
  }

  /**
   * Delete all images for a tour date. Returns the count of deleted images.
   */
  static async deleteByTourDateId(tourDateId: string): Promise<number> {
    const result = await prisma.tourDateImage.deleteMany({
      where: { tourDateId },
    });
    return result.count;
  }

  /**
   * Update the display order of a single image.
   */
  static async updateDisplayOrder(id: string, displayOrder: number): Promise<TourDateImageScalars> {
    return prisma.tourDateImage.update({
      where: { id },
      data: { displayOrder },
    });
  }

  /**
   * Reorder multiple images at once (atomic transaction).
   */
  static async reorderImages(
    imageOrders: TourDateImageOrderUpdate[]
  ): Promise<TourDateImageScalars[]> {
    return runQuery(() =>
      prisma.$transaction(
        imageOrders.map((order) =>
          prisma.tourDateImage.update({
            where: { id: order.id },
            data: { displayOrder: order.displayOrder },
          })
        )
      )
    );
  }

  /**
   * Count images for a tour date.
   */
  static async count(tourDateId: string): Promise<number> {
    return prisma.tourDateImage.count({
      where: { tourDateId },
    });
  }

  /**
   * Update alt text for an image.
   */
  static async updateAltText(id: string, altText: string | null): Promise<TourDateImageScalars> {
    return prisma.tourDateImage.update({
      where: { id },
      data: { altText },
    });
  }
}
