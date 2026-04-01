/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import 'server-only';

import { prisma } from '@/lib/prisma';

import type { ReleaseDigitalFormatFile } from '@prisma/client';

/**
 * Repository for ReleaseDigitalFormatFile data access
 * Handles CRUD operations for individual track files within a digital format
 */
export class ReleaseDigitalFormatFileRepository {
  /**
   * Create a single track file record
   */
  async create(data: {
    formatId: string;
    trackNumber: number;
    s3Key: string;
    fileName: string;
    fileSize: bigint;
    mimeType: string;
  }): Promise<ReleaseDigitalFormatFile> {
    return await prisma.releaseDigitalFormatFile.create({
      data: {
        format: { connect: { id: data.formatId } },
        trackNumber: data.trackNumber,
        s3Key: data.s3Key,
        fileName: data.fileName,
        fileSize: data.fileSize,
        mimeType: data.mimeType,
      },
    });
  }

  /**
   * Create multiple track file records in a batch
   * @returns Count of records created
   */
  async createMany(
    formatId: string,
    files: Array<{
      trackNumber: number;
      s3Key: string;
      fileName: string;
      fileSize: bigint;
      mimeType: string;
      title?: string;
      duration?: number;
    }>
  ): Promise<number> {
    const result = await prisma.releaseDigitalFormatFile.createMany({
      data: files.map((file) => ({
        formatId,
        trackNumber: file.trackNumber,
        s3Key: file.s3Key,
        fileName: file.fileName,
        fileSize: file.fileSize,
        mimeType: file.mimeType,
        ...(file.title && { title: file.title }),
        ...(file.duration && { duration: file.duration }),
      })),
    });
    return result.count;
  }

  /**
   * Find all track files for a format, ordered by trackNumber
   */
  async findAllByFormatId(formatId: string): Promise<ReleaseDigitalFormatFile[]> {
    return await prisma.releaseDigitalFormatFile.findMany({
      where: { formatId },
      orderBy: { trackNumber: 'asc' },
    });
  }

  /**
   * Find a specific track file by formatId and trackNumber
   */
  async findByFormatAndTrack(
    formatId: string,
    trackNumber: number
  ): Promise<ReleaseDigitalFormatFile | null> {
    return await prisma.releaseDigitalFormatFile.findUnique({
      where: {
        formatId_trackNumber: { formatId, trackNumber },
      },
    });
  }

  /**
   * Delete all track files for a format (used before re-upload replacement)
   * @returns Count of deleted records
   */
  async deleteAllByFormatId(formatId: string): Promise<number> {
    const result = await prisma.releaseDigitalFormatFile.deleteMany({
      where: { formatId },
    });
    return result.count;
  }

  /**
   * Delete a single track file by ID
   */
  async deleteById(id: string): Promise<ReleaseDigitalFormatFile> {
    return await prisma.releaseDigitalFormatFile.delete({
      where: { id },
    });
  }

  /**
   * Get the count of track files for a format
   */
  async getFileCount(formatId: string): Promise<number> {
    return await prisma.releaseDigitalFormatFile.count({
      where: { formatId },
    });
  }
}
