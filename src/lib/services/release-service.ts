/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import 'server-only';

import { Prisma } from '@prisma/client';

import { DownloadEventRepository } from '@/lib/repositories/download-event-repository';
import { PurchaseRepository } from '@/lib/repositories/purchase-repository';
import { ReleaseDigitalFormatFileRepository } from '@/lib/repositories/release-digital-format-file-repository';
import { ReleaseDigitalFormatRepository } from '@/lib/repositories/release-digital-format-repository';
import { ReleaseRepository } from '@/lib/repositories/release-repository';
import type {
  PublishedReleaseDetail,
  PublishedReleaseListing,
  Release,
  ReleaseCarouselItem,
  ReleaseListItem,
} from '@/lib/types/media-models';
import { deleteS3Object } from '@/utils/s3-client';
import { withCache } from '@/utils/simple-cache';

import type { ServiceResponse } from './service.types';

/**
 * Default page size for the public published-releases listing. Mirrors the
 * client-side `PUBLISHED_RELEASES_PAGE_SIZE` in
 * `use-infinite-published-releases-query`
 * (kept as a separate constant because this module is `server-only`).
 */
const PUBLISHED_RELEASES_PAGE_SIZE = 24;

const digitalFormatRepository = new ReleaseDigitalFormatRepository();
const digitalFormatFileRepository = new ReleaseDigitalFormatFileRepository();
const downloadEventRepository = new DownloadEventRepository();

export class ReleaseService {
  /**
   * Create a new release
   */
  static async createRelease(data: Prisma.ReleaseCreateInput): Promise<ServiceResponse<Release>> {
    try {
      const release = await ReleaseRepository.create(data);
      return { success: true, data: release };
    } catch (error) {
      // Unique constraint violations
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        return { success: false, error: 'Release with this title already exists' };
      }

      // Connection/network issues
      if (error instanceof Prisma.PrismaClientInitializationError) {
        console.error('Database connection failed:', error);
        return { success: false, error: 'Database unavailable' };
      }

      // Unknown errors
      console.error('Unexpected error:', error);
      return { success: false, error: 'Failed to create release' };
    }
  }

  /**
   * Get a release by ID
   */
  static async getReleaseById(id: string): Promise<ServiceResponse<Release>> {
    try {
      const release = await ReleaseRepository.findById(id);

      if (!release) {
        return { success: false, error: 'Release not found' };
      }

      return { success: true, data: release };
    } catch (error) {
      if (error instanceof Prisma.PrismaClientInitializationError) {
        console.error('Database connection failed:', error);
        return { success: false, error: 'Database unavailable' };
      }

      console.error('Unexpected error:', error);
      return { success: false, error: 'Failed to retrieve release' };
    }
  }

  /**
   * Get all releases with optional filters.
   *
   * Supports server-side `search` plus `published`/`deleted` filtering for the
   * admin listing. The search OR and the deletedOn OR are combined under `AND`
   * so the two `OR` keys never collide (Prisma 6 + MongoDB null-safe pattern).
   *
   * - `published === true` → only releases with a `publishedAt` date.
   * - `published === false` → only releases without a `publishedAt` date.
   * - `published == null` → no publish filter.
   * - `deleted` falsy → exclude soft-deleted releases; `deleted === true` → include them.
   */
  static async getReleases(params?: {
    skip?: number;
    take?: number;
    search?: string;
    artistIds?: string[];
    published?: boolean;
    deleted?: boolean;
  }): Promise<ServiceResponse<ReleaseListItem[]>> {
    try {
      const { skip = 0, take = 50, search, artistIds, published, deleted } = params || {};

      const contains = (value: string) => ({ contains: value, mode: 'insensitive' as const });
      const and: Prisma.ReleaseWhereInput[] = [];

      if (!deleted) {
        and.push({ OR: [{ deletedOn: null }, { deletedOn: { isSet: false } }] });
      }
      if (published === true) {
        and.push({ publishedAt: { not: null } });
      } else if (published === false) {
        and.push({ OR: [{ publishedAt: null }, { publishedAt: { isSet: false } }] });
      }
      if (search) {
        and.push({
          OR: [
            { title: contains(search) },
            { catalogNumber: contains(search) },
            { description: contains(search) },
          ],
        });
      }

      const where: Prisma.ReleaseWhereInput = {
        ...(and.length > 0 && { AND: and }),
        ...(artistIds &&
          artistIds.length > 0 && {
            artistReleases: {
              some: {
                artistId: { in: artistIds },
              },
            },
          }),
      };

      const releases = await ReleaseRepository.findMany({ where, skip, take });

      return { success: true, data: releases };
    } catch (error) {
      if (error instanceof Prisma.PrismaClientInitializationError) {
        console.error('Database connection failed:', error);
        return { success: false, error: 'Database unavailable' };
      }

      console.error('Unexpected error:', error);
      return { success: false, error: 'Failed to retrieve releases' };
    }
  }

  /**
   * Update a release by ID
   */
  static async updateRelease(
    id: string,
    data: Prisma.ReleaseUpdateInput
  ): Promise<ServiceResponse<Release>> {
    try {
      const release = await ReleaseRepository.update(id, data);

      return { success: true, data: release };
    } catch (error) {
      // Record not found
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
        return { success: false, error: 'Release not found' };
      }

      // Unique constraint violations
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        return { success: false, error: 'Release with this title already exists' };
      }

      if (error instanceof Prisma.PrismaClientInitializationError) {
        console.error('Database connection failed:', error);
        return { success: false, error: 'Database unavailable' };
      }

      console.error('Unexpected error:', error);
      return { success: false, error: 'Failed to update release' };
    }
  }

  /**
   * Delete a release by ID (hard delete).
   * Cascades to delete all related data EXCEPT Artist records.
   * Deletes S3 objects for digital format files and images.
   */
  static async deleteRelease(id: string): Promise<ServiceResponse<Release>> {
    try {
      // Verify release exists and fetch related data for S3 cleanup
      const existing = await ReleaseRepository.findForDeletion(id);

      if (!existing) {
        return { success: false, error: 'Release not found' };
      }

      // Collect S3 keys for cleanup
      const s3KeysToDelete: string[] = [];
      for (const format of existing.digitalFormats) {
        for (const file of format.files) {
          if (file.s3Key) s3KeysToDelete.push(file.s3Key);
        }
      }

      // Collect S3 keys from images and coverArt
      const cdnDomainRaw = process.env.CDN_DOMAIN;
      const cdnDomain = cdnDomainRaw?.replace(/^https?:\/\//, '');
      const imageUrls = existing.images
        .map((image) => image.src)
        .filter((src): src is string => Boolean(src));
      if (existing.coverArt) imageUrls.push(existing.coverArt);
      for (const url of imageUrls) {
        let s3Key: string | null = null;
        if (cdnDomain && url.includes(cdnDomain)) {
          s3Key = url.replace(/^(?:https:\/\/|http:\/\/)+/, '').replace(`${cdnDomain}/`, '');
        } else if (url.includes('.s3.')) {
          const urlParts = url.split('.s3.');
          if (urlParts[1]) {
            s3Key = urlParts[1].split('/').slice(1).join('/');
          }
        }
        if (s3Key) s3KeysToDelete.push(s3Key);
      }

      // Delete related records in dependency order (children first).
      // 1. Digital format files (children of ReleaseDigitalFormat) — one delete
      //    per format, run together since they target disjoint format ids.
      await Promise.all(
        existing.digitalFormats.map((format) =>
          digitalFormatFileRepository.deleteAllByFormatId(format.id)
        )
      );

      // 2. Everything else keyed off the release id touches a different
      //    collection, so the remaining cascade deletes run concurrently.
      await Promise.all([
        digitalFormatRepository.deleteAllByReleaseId(id),
        PurchaseRepository.deleteAllByReleaseId(id),
        PurchaseRepository.deleteAllDownloadsByReleaseId(id),
        downloadEventRepository.deleteAllByReleaseId(id),
        ReleaseRepository.deleteReleaseUrls(id),
        ReleaseRepository.deleteImages(id),
        ReleaseRepository.deleteArtistReleases(id),
        ReleaseRepository.clearFeaturedArtistReferences(id),
      ]);

      // 3. Delete the release itself, after all of its references are gone.
      const release = await ReleaseRepository.delete(id);

      // 10. Best-effort S3 cleanup (async, fire-and-forget)
      Promise.allSettled(s3KeysToDelete.map((key) => deleteS3Object(key))).catch(() => {
        // Silently ignore — S3 objects will be cleaned up by lifecycle rules
      });

      return { success: true, data: release };
    } catch (error) {
      // Record not found
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
        return { success: false, error: 'Release not found' };
      }

      if (error instanceof Prisma.PrismaClientInitializationError) {
        console.error('Database connection failed:', error);
        return { success: false, error: 'Database unavailable' };
      }

      console.error('Unexpected error:', error);
      return { success: false, error: 'Failed to delete release' };
    }
  }

  /**
   * Soft delete a release by ID (set deletedOn timestamp)
   */
  static async softDeleteRelease(id: string): Promise<ServiceResponse<Release>> {
    try {
      const release = await ReleaseRepository.softDelete(id);

      return { success: true, data: release };
    } catch (error) {
      // Record not found
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
        return { success: false, error: 'Release not found' };
      }

      if (error instanceof Prisma.PrismaClientInitializationError) {
        console.error('Database connection failed:', error);
        return { success: false, error: 'Database unavailable' };
      }

      console.error('Unexpected error:', error);
      return { success: false, error: 'Failed to soft delete release' };
    }
  }

  /**
   * Restore a soft-deleted release by ID (clear deletedOn timestamp)
   */
  static async restoreRelease(id: string): Promise<ServiceResponse<Release>> {
    try {
      const release = await ReleaseRepository.restore(id);

      return { success: true, data: release };
    } catch (error) {
      // Record not found
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
        return { success: false, error: 'Release not found' };
      }

      if (error instanceof Prisma.PrismaClientInitializationError) {
        console.error('Database connection failed:', error);
        return { success: false, error: 'Database unavailable' };
      }

      console.error('Unexpected error:', error);
      return { success: false, error: 'Failed to restore release' };
    }
  }

  // ===========================================================================
  // Public release methods (for /releases pages)
  // ===========================================================================

  /**
   * Get a page of published releases for the public listing page.
   * Includes artist info for display name and search, images for cover art
   * fallback, and URLs for Bandcamp links.
   *
   * Supports skip/offset pagination and an optional server-side `search` term
   * (title, catalog number, description, or artist name). Only the default,
   * unsearched first page is cached (10 min in production) — searched/offset
   * pages vary too much to share a cache entry.
   */
  static async getPublishedReleases(params?: {
    skip?: number;
    take?: number;
    search?: string;
  }): Promise<ServiceResponse<PublishedReleaseListing[]>> {
    const { skip = 0, take = PUBLISHED_RELEASES_PAGE_SIZE, search } = params ?? {};

    const fetchReleases = async (): Promise<ServiceResponse<PublishedReleaseListing[]>> => {
      try {
        const contains = { contains: search ?? '', mode: 'insensitive' as const };
        const where: Prisma.ReleaseWhereInput = {
          publishedAt: { not: null },
          // Prisma 6 + MongoDB: `deletedOn: null` only matches fields explicitly
          // set to null, not missing fields. Use OR to handle both cases. The
          // deletedOn OR and the search OR are combined under AND so they don't
          // collide on the same `OR` key.
          AND: [
            { OR: [{ deletedOn: null }, { deletedOn: { isSet: false } }] },
            ...(search
              ? [
                  {
                    OR: [
                      { title: contains },
                      { catalogNumber: contains },
                      { description: contains },
                      {
                        artistReleases: {
                          some: {
                            artist: {
                              OR: [
                                { firstName: contains },
                                { surname: contains },
                                { displayName: contains },
                              ],
                            },
                          },
                        },
                      },
                    ],
                  },
                ]
              : []),
          ],
        };

        const releases = await ReleaseRepository.findPublished({ where, skip, take });

        return {
          success: true,
          data: releases,
        };
      } catch (error) {
        if (error instanceof Prisma.PrismaClientInitializationError) {
          console.error('Database connection failed:', error);
          return { success: false, error: 'Database unavailable' };
        }

        console.error('Unexpected error:', error);
        return { success: false, error: 'Failed to fetch published releases' };
      }
    };

    // Only the default first page (no search, skip 0) is cacheable.
    if (process.env.NODE_ENV === 'development' || search || skip > 0) {
      return fetchReleases();
    }

    return withCache(`published-releases:${take}`, fetchReleases, 600);
  }

  /**
   * Get a single published release with digital format files for the media player page.
   * Returns MP3_320KBPS files sorted by track number for audio playback.
   * Returns `{ success: false }` when the release is not found or not published.
   */
  static async getReleaseWithTracks(id: string): Promise<ServiceResponse<PublishedReleaseDetail>> {
    try {
      const release = await ReleaseRepository.findPublishedWithTracks(id);

      if (!release) {
        return { success: false, error: 'Release not found' };
      }

      return { success: true, data: release };
    } catch (error) {
      if (error instanceof Prisma.PrismaClientInitializationError) {
        console.error('Database connection failed:', error);
        return { success: false, error: 'Database unavailable' };
      }

      console.error('Unexpected error:', error);
      return { success: false, error: 'Failed to retrieve release' };
    }
  }

  /**
   * Get other published releases by an artist, excluding the current release.
   * Used for the "more by this artist" carousel on the media player page.
   */
  static async getArtistOtherReleases(
    artistId: string,
    excludeReleaseId: string
  ): Promise<ServiceResponse<ReleaseCarouselItem[]>> {
    try {
      const releases = await ReleaseRepository.findPublishedByArtistExcluding(
        artistId,
        excludeReleaseId
      );

      return { success: true, data: releases };
    } catch (error) {
      if (error instanceof Prisma.PrismaClientInitializationError) {
        console.error('Database connection failed:', error);
        return { success: false, error: 'Database unavailable' };
      }

      console.error('Unexpected error:', error);
      return { success: false, error: 'Failed to fetch artist releases' };
    }
  }

  /**
   * Find the first release whose title matches `title` case-insensitively.
   * Used by the find-or-create-release flow to dedupe by album title.
   */
  static async findByTitleInsensitive(title: string): Promise<{
    id: string;
    title: string;
    publishedAt: Date | null;
    deletedOn: Date | null;
  } | null> {
    return ReleaseRepository.findByTitleInsensitive(title);
  }

  /**
   * Apply un-delete and/or publish to a found release. No-ops when there is
   * nothing to update so callers don't have to inspect the partial payload.
   */
  static async applyFoundReleaseUpdate(
    id: string,
    updates: { undelete?: boolean; publish?: boolean }
  ): Promise<void> {
    const data: { deletedOn?: null; publishedAt?: Date } = {};
    if (updates.undelete) {
      data.deletedOn = null;
    }
    if (updates.publish) {
      data.publishedAt = new Date();
    }
    if (Object.keys(data).length === 0) {
      return;
    }
    await ReleaseRepository.updateData(id, data);
  }

  /**
   * Fetch the title of a published release by id. Returns null when the
   * release is missing or unpublished. Used by download endpoints that only
   * need the title for the ZIP filename.
   */
  static async findPublishedTitleById(id: string): Promise<{ id: string; title: string } | null> {
    return ReleaseRepository.findPublishedTitleById(id);
  }

  /**
   * Fetch the title of a release by id regardless of publish state. Used by
   * post-purchase confirmation flows where the release may have since been
   * unpublished but the customer still needs the original title.
   */
  static async findTitleById(id: string): Promise<{ id: string; title: string } | null> {
    return ReleaseRepository.findTitleById(id);
  }

  /**
   * Lightweight existence check used by callers that only need to validate a
   * releaseId before performing a follow-up write.
   */
  static async existsById(id: string): Promise<boolean> {
    return ReleaseRepository.existsById(id);
  }
}
