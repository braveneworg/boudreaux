/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import 'server-only';

import type { DigitalFormatType } from '@/lib/constants/digital-formats';
import { prisma } from '@/lib/prisma';

import { digitalFormatWhere } from './_internal/digital-format-where';
import { runQuery } from './_internal/map-prisma-error';

import type { Prisma, ReleaseDigitalFormat, ReleaseDigitalFormatFile } from '@prisma/client';

/** ReleaseDigitalFormat with its child track files included */
export type ReleaseDigitalFormatWithFiles = ReleaseDigitalFormat & {
  files: ReleaseDigitalFormatFile[];
};

/** One track file a replacement writes. */
export interface TrackFileInput {
  trackNumber: number;
  s3Key: string;
  fileName: string;
  fileSize: bigint;
  mimeType: string;
  title?: string;
  duration?: number;
}

/** What a track replacement wrote, and the keys of the tracks it replaced. */
export interface TrackReplacement {
  formatId: string;
  fileCount: number;
  replacedKeys: string[];
}

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
   * Find the first active (non-deleted) format for a release + formatType.
   * Used by the download-authorization flow. Returns the bare format (no
   * child files) or null.
   */
  async findActiveByReleaseAndFormat(
    releaseId: string,
    formatType: DigitalFormatType
  ): Promise<ReleaseDigitalFormat | null> {
    return await prisma.releaseDigitalFormat.findFirst({
      where: { releaseId, formatType, ...digitalFormatWhere.active },
    });
  }

  /**
   * Find all active (non-deleted) digital formats for a release
   * Includes child track files ordered by trackNumber
   */
  async findAllByRelease(releaseId: string): Promise<ReleaseDigitalFormatWithFiles[]> {
    return await prisma.releaseDigitalFormat.findMany({
      where: { releaseId, ...digitalFormatWhere.active },
      include: { files: { orderBy: { trackNumber: 'asc' } } },
    });
  }

  /**
   * Every digital format of a release, withdrawn (soft-deleted) ones
   * included, with child track files. The download gate reads this: whether
   * a withdrawn format may still be delivered is the gate's decision, not the
   * query's (ADR-0018).
   */
  async findAllByReleaseIncludingWithdrawn(
    releaseId: string
  ): Promise<ReleaseDigitalFormatWithFiles[]> {
    return await prisma.releaseDigitalFormat.findMany({
      where: { releaseId },
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
   * Replace a format's track files in one transaction: upsert the parent (or
   * restore it when soft-deleted), delete its old tracks, create the new ones
   * and recount. A failure part-way leaves the previous tracks and counts.
   * Bulk-creates with one `createMany` — never concurrent `create`s, which
   * race Prisma's read-back on fresh collections.
   */
  async replaceTracks(
    releaseId: string,
    formatType: DigitalFormatType,
    files: ReadonlyArray<TrackFileInput>
  ): Promise<TrackReplacement> {
    return runQuery(() =>
      prisma.$transaction(async (tx) => {
        const parent = await tx.releaseDigitalFormat.upsert({
          where: { releaseId_formatType: { releaseId, formatType } },
          create: { release: { connect: { id: releaseId } }, formatType, trackCount: 0 },
          update: { deletedAt: null },
        });
        const replaced = await tx.releaseDigitalFormatFile.findMany({
          where: { formatId: parent.id },
          select: { s3Key: true },
        });
        await tx.releaseDigitalFormatFile.deleteMany({ where: { formatId: parent.id } });
        const created = await tx.releaseDigitalFormatFile.createMany({
          data: files.map((file) => ({
            formatId: parent.id,
            trackNumber: file.trackNumber,
            s3Key: file.s3Key,
            fileName: file.fileName,
            fileSize: file.fileSize,
            mimeType: file.mimeType,
            ...(file.title && { title: file.title }),
            ...(file.duration && { duration: file.duration }),
          })),
        });
        const aggregation = await tx.releaseDigitalFormatFile.aggregate({
          where: { formatId: parent.id },
          _count: true,
          _sum: { fileSize: true },
        });
        await tx.releaseDigitalFormat.update({
          where: { id: parent.id },
          data: {
            trackCount: aggregation._count,
            totalFileSize: aggregation._sum.fileSize ?? BigInt(0),
          },
        });
        return {
          formatId: parent.id,
          fileCount: created.count,
          replacedKeys: replaced.map(({ s3Key }) => s3Key),
        };
      })
    );
  }

  /**
   * The keys, out of `keys`, that a format row (the legacy single-file key)
   * or a track row references. Withdrawn formats count: their files are kept
   * until the format is hard-deleted.
   */
  async findReferencedS3Keys(keys: ReadonlyArray<string>): Promise<string[]> {
    if (keys.length === 0) {
      return [];
    }

    const where = { s3Key: { in: [...keys] } };
    const [formats, files] = await Promise.all([
      prisma.releaseDigitalFormat.findMany({ where, select: { s3Key: true } }),
      prisma.releaseDigitalFormatFile.findMany({ where, select: { s3Key: true } }),
    ]);
    const referenced = [...formats, ...files]
      .map(({ s3Key }) => s3Key)
      .filter((s3Key): s3Key is string => s3Key !== null);

    return [...new Set(referenced)];
  }

  /**
   * Delete all digital-format records for a release (used by the release
   * delete cascade, after their child files have been removed).
   * @returns Count of deleted records
   */
  async deleteAllByReleaseId(releaseId: string): Promise<number> {
    const result = await prisma.releaseDigitalFormat.deleteMany({
      where: { releaseId },
    });
    return result.count;
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
