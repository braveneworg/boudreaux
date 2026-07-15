/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import 'server-only';

import type { DigitalFormatType } from '@/lib/constants/digital-formats';
import { prisma } from '@/lib/prisma';

import { runQuery } from './_internal/map-prisma-error';

import type { Prisma, ReleaseDigitalFormatFile } from '@prisma/client';

// =============================================================================
// Query shapes
// =============================================================================

/**
 * Select projection shared by `findManyByIdsWithRelease` and
 * `searchTracksByTitle`. Deliberately omits `fileSize` (BigInt) which breaks
 * JSON serialisation in API route responses.
 */
const trackFileWithReleaseSelect = {
  id: true,
  trackNumber: true,
  title: true,
  duration: true,
  s3Key: true,
  fileName: true,
  mimeType: true,
  format: {
    select: {
      formatType: true,
      releaseId: true,
      release: {
        select: {
          id: true,
          title: true,
          coverArt: true,
          publishedAt: true,
          artistReleases: {
            select: {
              artist: {
                select: {
                  displayName: true,
                  firstName: true,
                  surname: true,
                },
              },
            },
          },
        },
      },
    },
  },
} as const satisfies Prisma.ReleaseDigitalFormatFileSelect;

/**
 * The published-release filter mirrored from `release-repository.ts`
 * `buildPublishedWhere` (no search term variant). Matches records whose release
 * has `publishedAt` set and has not been soft-deleted (`deletedOn`).
 */
const publishedReleaseFilter = {
  publishedAt: { not: null },
  AND: [{ OR: [{ deletedOn: null }, { deletedOn: { isSet: false } }] }],
} as const satisfies Prisma.ReleaseWhereInput;

/**
 * Select for playlist zip downloads: just enough to match a requested-format
 * file to a playlist item by (releaseId, trackNumber) and stream it from S3.
 * `fileSize` (BigInt) is deliberately omitted — JSON-unsafe.
 */
const playlistDownloadFileSelect = {
  id: true,
  trackNumber: true,
  s3Key: true,
  fileName: true,
  format: { select: { formatType: true, releaseId: true } },
} as const satisfies Prisma.ReleaseDigitalFormatFileSelect;

// =============================================================================
// Return types
// =============================================================================

/** Track file row joined with its parent format and release. Exported for
 * downstream services (playlist service, search handler). `fileSize` is
 * intentionally absent — BigInt cannot be serialised to JSON. */
export type TrackFileWithRelease = Prisma.ReleaseDigitalFormatFileGetPayload<{
  select: typeof trackFileWithReleaseSelect;
}>;

/** Requested-format file row for playlist downloads. */
export type PlaylistDownloadFile = Prisma.ReleaseDigitalFormatFileGetPayload<{
  select: typeof playlistDownloadFileSelect;
}>;

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

  /**
   * Fetch track files by their ids, joining parent format and release.
   * Used by the playlist service to resolve playlist-item track references.
   * `fileSize` is omitted from the select — BigInt breaks JSON serialisation.
   */
  async findManyByIdsWithRelease(ids: string[]): Promise<TrackFileWithRelease[]> {
    return runQuery(() =>
      prisma.releaseDigitalFormatFile.findMany({
        where: { id: { in: ids } },
        select: trackFileWithReleaseSelect,
      })
    );
  }

  /**
   * Search track files by title (case-insensitive substring), restricted to
   * non-deleted MP3_320KBPS formats on published, non-deleted releases.
   * Ordered by title asc for deterministic results. Used by the playlist
   * media-search endpoint.
   * `fileSize` is omitted from the select — BigInt breaks JSON serialisation.
   */
  async searchTracksByTitle(q: string, take: number): Promise<TrackFileWithRelease[]> {
    return runQuery(() =>
      prisma.releaseDigitalFormatFile.findMany({
        where: {
          title: { contains: q, mode: 'insensitive' },
          format: {
            is: {
              formatType: 'MP3_320KBPS',
              OR: [{ deletedAt: null }, { deletedAt: { isSet: false } }],
              release: { is: publishedReleaseFilter },
            },
          },
        },
        orderBy: { title: 'asc' },
        take,
        select: trackFileWithReleaseSelect,
      })
    );
  }

  /**
   * Fetch every track file of `formatType` across a set of releases, restricted
   * to non-deleted formats on published, non-deleted releases. The playlist
   * download route matches these to items by (releaseId, trackNumber) — the
   * PR2 lookup the PR1 plan deferred.
   */
  async findManyByReleaseIdsAndFormatType(
    releaseIds: string[],
    formatType: DigitalFormatType
  ): Promise<PlaylistDownloadFile[]> {
    return runQuery(() =>
      prisma.releaseDigitalFormatFile.findMany({
        where: {
          format: {
            is: {
              formatType,
              releaseId: { in: releaseIds },
              OR: [{ deletedAt: null }, { deletedAt: { isSet: false } }],
              release: { is: publishedReleaseFilter },
            },
          },
        },
        select: playlistDownloadFileSelect,
      })
    );
  }
}
