/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import 'server-only';

import type { DigitalFormatType } from '@/lib/constants/digital-formats';
import { prisma } from '@/lib/prisma';

import type { Prisma, ReleaseDigitalFormat, ReleaseDigitalFormatFile } from '@prisma/client';

/** ReleaseDigitalFormat with its child track files included */
export type ReleaseDigitalFormatWithFiles = ReleaseDigitalFormat & {
  files: ReleaseDigitalFormatFile[];
};

/**
 * Repository for ReleaseDigitalFormat data access
 * Handles CRUD operations, soft delete, and unique constraint enforcement
 */
export class ReleaseDigitalFormatRepository {
  /**
   * Create a new digital format record
   * @throws {Error} If unique constraint (releaseId + formatType) is violated (Prisma P2002)
   */
  async create(data: Prisma.ReleaseDigitalFormatCreateInput): Promise<ReleaseDigitalFormat> {
    return await prisma.releaseDigitalFormat.create({
      data,
    });
  }

  /**
   * Find a digital format by releaseId and formatType
   * Returns null if not found or soft-deleted
   * Includes child track files ordered by trackNumber
   */
  async findByReleaseAndFormat(
    releaseId: string,
    formatType: DigitalFormatType
  ): Promise<ReleaseDigitalFormatWithFiles | null> {
    const format = await prisma.releaseDigitalFormat.findUnique({
      where: {
        releaseId_formatType: {
          releaseId,
          formatType,
        },
      },
      include: { files: { orderBy: { trackNumber: 'asc' } } },
    });

    // Filter out soft-deleted formats
    if (format && format.deletedAt !== null) {
      return null;
    }

    return format;
  }

  /**
   * Find all active (non-deleted) digital formats for a release
   * Includes child track files ordered by trackNumber
   */
  async findAllByRelease(releaseId: string): Promise<ReleaseDigitalFormatWithFiles[]> {
    return await prisma.releaseDigitalFormat.findMany({
      where: {
        releaseId,
        deletedAt: null, // Only active formats
      },
      include: { files: { orderBy: { trackNumber: 'asc' } } },
    });
  }

  /**
   * Soft delete a format by setting deletedAt timestamp
   * S3 key is preserved for grace period restoration
   */
  async softDelete(
    releaseId: string,
    formatType: DigitalFormatType
  ): Promise<ReleaseDigitalFormat> {
    return await prisma.releaseDigitalFormat.update({
      where: {
        releaseId_formatType: {
          releaseId,
          formatType,
        },
      },
      data: {
        deletedAt: new Date(),
      },
    });
  }

  /**
   * Update S3 key for an existing format
   * Used when re-uploading files
   * @throws {Error} If format does not exist (Prisma P2025)
   */
  async updateS3Key(
    releaseId: string,
    formatType: DigitalFormatType,
    s3Key: string
  ): Promise<ReleaseDigitalFormat> {
    return await prisma.releaseDigitalFormat.update({
      where: {
        releaseId_formatType: {
          releaseId,
          formatType,
        },
      },
      data: {
        s3Key,
      },
    });
  }

  /**
   * Restore a soft-deleted format within grace period
   * Sets deletedAt back to null
   */
  async restore(releaseId: string, formatType: DigitalFormatType): Promise<ReleaseDigitalFormat> {
    return await prisma.releaseDigitalFormat.update({
      where: {
        releaseId_formatType: {
          releaseId,
          formatType,
        },
      },
      data: {
        deletedAt: null,
      },
    });
  }

  /**
   * Hard delete a format (permanent removal from database)
   * Used after grace period expires
   */
  async hardDelete(
    releaseId: string,
    formatType: DigitalFormatType
  ): Promise<ReleaseDigitalFormat> {
    return await prisma.releaseDigitalFormat.delete({
      where: {
        releaseId_formatType: {
          releaseId,
          formatType,
        },
      },
    });
  }

  /**
   * Find formats deleted before a given date (for cleanup jobs)
   */
  async findExpiredDeleted(expiryDate: Date): Promise<ReleaseDigitalFormat[]> {
    return await prisma.releaseDigitalFormat.findMany({
      where: {
        deletedAt: {
          not: null,
          lt: expiryDate,
        },
      },
    });
  }

  /**
   * Upsert a parent format grouping record
   * Creates if not exists, restores if soft-deleted
   */
  async upsertParent(
    releaseId: string,
    formatType: DigitalFormatType
  ): Promise<ReleaseDigitalFormat> {
    return await prisma.releaseDigitalFormat.upsert({
      where: {
        releaseId_formatType: { releaseId, formatType },
      },
      create: {
        release: { connect: { id: releaseId } },
        formatType,
        trackCount: 0,
      },
      update: {
        deletedAt: null, // Restore if soft-deleted
      },
    });
  }

  /**
   * Recalculate trackCount and totalFileSize from child files
   */
  async updateTrackCounts(formatId: string): Promise<ReleaseDigitalFormat> {
    const aggregation = await prisma.releaseDigitalFormatFile.aggregate({
      where: { formatId },
      _count: true,
      _sum: { fileSize: true },
    });

    return await prisma.releaseDigitalFormat.update({
      where: { id: formatId },
      data: {
        trackCount: aggregation._count,
        totalFileSize: aggregation._sum.fileSize ?? BigInt(0),
      },
    });
  }
}
