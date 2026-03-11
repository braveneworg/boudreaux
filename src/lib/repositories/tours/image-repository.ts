/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import 'server-only';

import { prisma } from '@/lib/prisma';

import type { TourImage } from '@prisma/client';

export interface CreateImageInput {
  tourId: string;
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

export interface ImageOrderUpdate {
  id: string;
  displayOrder: number;
}

/**
 * Repository for tour image database operations
 */
export class ImageRepository {
  /**
   * Find all images for a tour, sorted by display order
   */
  static async findByTourId(tourId: string): Promise<TourImage[]> {
    return prisma.tourImage.findMany({
      where: { tourId },
      orderBy: { displayOrder: 'asc' },
    });
  }

  /**
   * Find a single image by ID
   */
  static async findById(id: string): Promise<TourImage | null> {
    return prisma.tourImage.findUnique({
      where: { id },
    });
  }

  /**
   * Create a new tour image record
   */
  static async create(data: CreateImageInput): Promise<TourImage> {
    return prisma.tourImage.create({
      data,
    });
  }

  /**
   * Delete an image by ID
   */
  static async delete(id: string): Promise<TourImage> {
    return prisma.tourImage.delete({
      where: { id },
    });
  }

  /**
   * Delete all images for a tour
   * Returns the count of deleted images
   */
  static async deleteByTourId(tourId: string): Promise<number> {
    const result = await prisma.tourImage.deleteMany({
      where: { tourId },
    });
    return result.count;
  }

  /**
   * Update the display order of a single image
   */
  static async updateDisplayOrder(id: string, displayOrder: number): Promise<TourImage> {
    return prisma.tourImage.update({
      where: { id },
      data: { displayOrder },
    });
  }

  /**
   * Reorder multiple images at once (atomic transaction)
   */
  static async reorderImages(imageOrders: ImageOrderUpdate[]): Promise<TourImage[]> {
    return prisma.$transaction(
      imageOrders.map((order) =>
        prisma.tourImage.update({
          where: { id: order.id },
          data: { displayOrder: order.displayOrder },
        })
      )
    );
  }

  /**
   * Count images for a tour
   */
  static async count(tourId: string): Promise<number> {
    return prisma.tourImage.count({
      where: { tourId },
    });
  }

  /**
   * Update alt text for an image
   */
  static async updateAltText(id: string, altText: string | null): Promise<TourImage> {
    return prisma.tourImage.update({
      where: { id },
      data: { altText },
    });
  }
}
