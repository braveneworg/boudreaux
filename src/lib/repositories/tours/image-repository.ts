/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import 'server-only';

import { prisma } from '@/lib/prisma';
import type { TourImageScalars } from '@/lib/types/tours';

import { runQuery } from '../_internal/map-prisma-error';
import { retryOnWriteConflict } from '../_internal/write-conflict';

import type { AssertExact } from '../_internal/drift';
import type { Prisma } from '@prisma/client';

export interface CreateImageInput {
  tourId: string;
  s3Key: string;
  s3Url: string;
  s3Bucket: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
  altText?: string;
  uploadedBy?: string;
}

export interface ImageOrderUpdate {
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
// `TourImageScalars` diverges from the Prisma tour-image model scalars.
type _TourImageDrift = AssertExact<
  TourImageScalars,
  Prisma.TourImageGetPayload<Record<never, never>>
>;
const _tourImageDrift: _TourImageDrift = true;

/**
 * Repository for tour image database operations. The only layer that touches
 * Prisma for tour images: it returns hand-written, Prisma-free domain types.
 */
export class ImageRepository {
  /**
   * Find all images for a tour, sorted by display order.
   */
  static async findByTourId(tourId: string): Promise<TourImageScalars[]> {
    return prisma.tourImage.findMany({
      where: { tourId },
      orderBy: { displayOrder: 'asc' },
    });
  }

  /**
   * Find a single image by ID.
   */
  static async findById(id: string): Promise<TourImageScalars | null> {
    return prisma.tourImage.findUnique({
      where: { id },
    });
  }

  /**
   * Record a new image as the tour's last, unless it already holds
   * `maxImages`: null then, and nothing is written. The count and the insert
   * run in one transaction that first writes the tour's own document,
   * so two confirms for one tour cannot both count under the cap: the
   * second to write the document loses a write conflict, runs again, and
   * counts the first one's image. A tour that does not exist fails
   * `NOT_FOUND` instead of gaining an orphaned image.
   */
  static async createWithinCap(
    data: CreateImageInput,
    maxImages: number
  ): Promise<TourImageScalars | null> {
    return retryOnWriteConflict(
      () =>
        runQuery(() =>
          prisma.$transaction(async (tx) => {
            await tx.tour.update({
              where: { id: data.tourId },
              data: { updatedAt: new Date() },
            });
            const displayOrder = await tx.tourImage.count({
              where: { tourId: data.tourId },
            });
            if (displayOrder >= maxImages) {
              return null;
            }
            return tx.tourImage.create({ data: { ...data, displayOrder } });
          })
        ),
      CONFIRM_ATTEMPTS
    );
  }

  /**
   * Delete an image by ID.
   */
  static async delete(id: string): Promise<TourImageScalars> {
    return prisma.tourImage.delete({
      where: { id },
    });
  }

  /**
   * Delete all images for a tour. Returns the count of deleted images.
   */
  static async deleteByTourId(tourId: string): Promise<number> {
    const result = await prisma.tourImage.deleteMany({
      where: { tourId },
    });
    return result.count;
  }

  /**
   * Update the display order of a single image.
   */
  static async updateDisplayOrder(id: string, displayOrder: number): Promise<TourImageScalars> {
    return prisma.tourImage.update({
      where: { id },
      data: { displayOrder },
    });
  }

  /**
   * Reorder multiple images at once (atomic transaction).
   */
  static async reorderImages(imageOrders: ImageOrderUpdate[]): Promise<TourImageScalars[]> {
    return runQuery(() =>
      prisma.$transaction(
        imageOrders.map((order) =>
          prisma.tourImage.update({
            where: { id: order.id },
            data: { displayOrder: order.displayOrder },
          })
        )
      )
    );
  }

  /**
   * Count images for a tour.
   */
  static async count(tourId: string): Promise<number> {
    return prisma.tourImage.count({
      where: { tourId },
    });
  }

  /**
   * Update alt text for an image.
   */
  static async updateAltText(id: string, altText: string | null): Promise<TourImageScalars> {
    return prisma.tourImage.update({
      where: { id },
      data: { altText },
    });
  }
}
