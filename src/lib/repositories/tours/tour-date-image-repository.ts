/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import 'server-only';

import { prisma } from '@/lib/prisma';

import type { TourDateImage } from '@prisma/client';

export interface CreateTourDateImageInput {
  tourDateId: string;
  s3Key: string;
  s3Url: string;
  s3Bucket: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
  displayOrder: number;
  altText?: string;
  uploadedBy?: string;
}

export interface TourDateImageOrderUpdate {
  id: string;
  displayOrder: number;
}

/**
 * Repository for tour date image database operations
 */
export class TourDateImageRepository {
  /**
   * Find all images for a tour date, sorted by display order
   */
  static async findByTourDateId(tourDateId: string): Promise<TourDateImage[]> {
    return prisma.tourDateImage.findMany({
      where: { tourDateId },
      orderBy: { displayOrder: 'asc' },
    });
  }

  /**
   * Find a single image by ID
   */
  static async findById(id: string): Promise<TourDateImage | null> {
    return prisma.tourDateImage.findUnique({
      where: { id },
    });
  }

  /**
   * Create a new tour date image record
   */
  static async create(data: CreateTourDateImageInput): Promise<TourDateImage> {
    return prisma.tourDateImage.create({
      data,
    });
  }

  /**
   * Delete an image by ID
   */
  static async delete(id: string): Promise<TourDateImage> {
    return prisma.tourDateImage.delete({
      where: { id },
    });
  }

  /**
   * Delete all images for a tour date
   * Returns the count of deleted images
   */
  static async deleteByTourDateId(tourDateId: string): Promise<number> {
    const result = await prisma.tourDateImage.deleteMany({
      where: { tourDateId },
    });
    return result.count;
  }

  /**
   * Update the display order of a single image
   */
  static async updateDisplayOrder(id: string, displayOrder: number): Promise<TourDateImage> {
    return prisma.tourDateImage.update({
      where: { id },
      data: { displayOrder },
    });
  }

  /**
   * Reorder multiple images at once (atomic transaction)
   */
  static async reorderImages(imageOrders: TourDateImageOrderUpdate[]): Promise<TourDateImage[]> {
    return prisma.$transaction(
      imageOrders.map((order) =>
        prisma.tourDateImage.update({
          where: { id: order.id },
          data: { displayOrder: order.displayOrder },
        })
      )
    );
  }

  /**
   * Count images for a tour date
   */
  static async count(tourDateId: string): Promise<number> {
    return prisma.tourDateImage.count({
      where: { tourDateId },
    });
  }

  /**
   * Update alt text for an image
   */
  static async updateAltText(id: string, altText: string | null): Promise<TourDateImage> {
    return prisma.tourDateImage.update({
      where: { id },
      data: { altText },
    });
  }
}
