/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import 'server-only';

import { prisma } from '@/lib/prisma';
import {
  publishedReleaseDetailInclude,
  publishedReleaseListingSelect,
  releaseListItemInclude,
} from '@/lib/types/media-models';
import type {
  PublishedReleaseDetail,
  PublishedReleaseListing,
  Release,
  ReleaseCarouselItem,
  ReleaseListItem,
} from '@/lib/types/media-models';

import type { Prisma } from '@prisma/client';

/**
 * Shared include shape for a fully-hydrated release detail. Mirrors the
 * `Release` domain type (artist info, digital formats + files, release URLs,
 * images) so query responses validate against `releaseSchema`. Track files are
 * ordered by `trackNumber` and images by `sortOrder`. The `images` filter is
 * supplied per-call (bounded for listings, unbounded for detail views).
 */
const releaseDetailInclude = {
  artistReleases: {
    include: {
      artist: true,
    },
  },
  digitalFormats: {
    include: {
      files: {
        orderBy: { trackNumber: 'asc' as const },
      },
    },
  },
  releaseUrls: {
    include: {
      url: true,
    },
  },
} satisfies Omit<Prisma.ReleaseInclude, 'images'>;

/**
 * Raw, unhydrated S3-cleanup view of a release used by `deleteRelease`. Loads
 * just the digital-format files and images needed to enumerate S3 keys before
 * the cascade.
 */
export type ReleaseForDeletion = Prisma.ReleaseGetPayload<{
  include: {
    digitalFormats: { include: { files: true } };
    images: true;
  };
}>;

/**
 * Data-access layer for the Release model and its directly-owned relations
 * (ReleaseUrl, ArtistRelease, and FeaturedArtist cleanup on release delete).
 *
 * All methods return RAW Prisma results — business logic, validation,
 * `ServiceResponse` wrapping, computed fields, and error handling live in
 * `ReleaseService`. Include/select/where shapes are preserved exactly because
 * they match the Zod schemas the query layer validates against.
 */
export class ReleaseRepository {
  /**
   * Create a new release, returning it with the full detail include
   * (images unbounded, plus artists, digital formats + files, and URLs).
   */
  static async create(data: Prisma.ReleaseCreateInput): Promise<Release> {
    const release = await prisma.release.create({
      data,
      include: {
        artistReleases: {
          include: {
            artist: true,
          },
        },
        digitalFormats: {
          include: {
            files: true,
          },
        },
        releaseUrls: {
          include: {
            url: true,
          },
        },
        images: true,
      },
    });
    return release as unknown as Release;
  }

  /**
   * Find a release by id with the full detail include. Images are unbounded
   * and ordered by `sortOrder`. Returns `null` when not found.
   */
  static async findById(id: string): Promise<Release | null> {
    const release = await prisma.release.findUnique({
      where: { id },
      include: {
        images: {
          orderBy: { sortOrder: 'asc' },
        },
        ...releaseDetailInclude,
      },
    });
    return release as unknown as Release | null;
  }

  /**
   * Find many releases for the admin listing using a caller-built `where`
   * clause. Uses the lightweight listing include (scalars, capped cover-art
   * images, and artist join rows) — the grid never renders digital-format
   * files or release URLs, so those relations are not loaded. Results ordered
   * by `createdAt` desc.
   */
  static async findMany(params: {
    where: Prisma.ReleaseWhereInput;
    skip: number;
    take: number;
  }): Promise<ReleaseListItem[]> {
    const { where, skip, take } = params;
    return prisma.release.findMany({
      where,
      skip,
      take,
      orderBy: { createdAt: 'desc' },
      include: releaseListItemInclude,
    });
  }

  /** Count releases matching an optional filter (used by the admin dashboard). */
  static async count(where: Prisma.ReleaseWhereInput = {}): Promise<number> {
    return prisma.release.count({ where });
  }

  /**
   * Update a release by id with the full detail include (images unbounded).
   */
  static async update(id: string, data: Prisma.ReleaseUpdateInput): Promise<Release> {
    const release = await prisma.release.update({
      where: { id },
      data,
      include: {
        images: true,
        ...releaseDetailInclude,
      },
    });
    return release as unknown as Release;
  }

  /**
   * Apply a partial update (used by un-delete/publish and soft-delete flows)
   * without re-hydrating relations. Returns the raw updated release.
   */
  static async updateData(id: string, data: Prisma.ReleaseUpdateInput): Promise<Release> {
    const release = await prisma.release.update({
      where: { id },
      data,
    });
    return release as unknown as Release;
  }

  /**
   * Set a release's `deletedOn` to now (soft delete), returning the release
   * with the full detail include (files unordered, matching the prior shape).
   */
  static async softDelete(id: string): Promise<Release> {
    const release = await prisma.release.update({
      where: { id },
      data: { deletedOn: new Date() },
      include: {
        images: true,
        artistReleases: {
          include: {
            artist: true,
          },
        },
        digitalFormats: {
          include: {
            files: true,
          },
        },
        releaseUrls: {
          include: {
            url: true,
          },
        },
      },
    });
    return release as unknown as Release;
  }

  /**
   * Clear a release's `deletedOn` (restore), returning the release with the
   * full detail include (files unordered, matching the prior shape).
   */
  static async restore(id: string): Promise<Release> {
    const release = await prisma.release.update({
      where: { id },
      data: { deletedOn: null },
      include: {
        images: true,
        artistReleases: {
          include: {
            artist: true,
          },
        },
        digitalFormats: {
          include: {
            files: true,
          },
        },
        releaseUrls: {
          include: {
            url: true,
          },
        },
      },
    });
    return release as unknown as Release;
  }

  /**
   * Load the S3-cleanup view of a release (digital-format files + images)
   * used to enumerate S3 keys before a hard delete. Returns `null` when the
   * release does not exist.
   */
  static async findForDeletion(id: string): Promise<ReleaseForDeletion | null> {
    return prisma.release.findUnique({
      where: { id },
      include: {
        digitalFormats: {
          include: { files: true },
        },
        images: true,
      },
    });
  }

  /**
   * Hard delete a release by id (the final step of the delete cascade, after
   * all related records have been removed).
   */
  static async delete(id: string): Promise<Release> {
    const release = await prisma.release.delete({
      where: { id },
    });
    return release as unknown as Release;
  }

  /**
   * Delete all ReleaseUrl junction records for a release.
   */
  static async deleteReleaseUrls(releaseId: string): Promise<void> {
    await prisma.releaseUrl.deleteMany({ where: { releaseId } });
  }

  /**
   * Delete all images linked to a release (shared Image model — scoped to this
   * release only). Part of the release delete cascade.
   */
  static async deleteImages(releaseId: string): Promise<void> {
    await prisma.image.deleteMany({ where: { releaseId } });
  }

  /**
   * Delete all ArtistRelease junction records for a release (does NOT delete
   * the Artist records themselves).
   */
  static async deleteArtistReleases(releaseId: string): Promise<void> {
    await prisma.artistRelease.deleteMany({ where: { releaseId } });
  }

  /**
   * Disconnect FeaturedArtist references to a release (set `releaseId` to null)
   * without deleting the FeaturedArtist records.
   */
  static async clearFeaturedArtistReferences(releaseId: string): Promise<void> {
    await prisma.featuredArtist.updateMany({
      where: { releaseId },
      data: { releaseId: null },
    });
  }

  /**
   * Fetch a page of published, non-deleted releases for the public listing,
   * using a caller-built `where` clause and the listing projection. Ordered by
   * `releasedOn` desc.
   */
  static async findPublished(params: {
    where: Prisma.ReleaseWhereInput;
    skip: number;
    take: number;
  }): Promise<PublishedReleaseListing[]> {
    const { where, skip, take } = params;
    return prisma.release.findMany({
      where,
      orderBy: { releasedOn: 'desc' },
      skip,
      take,
      select: publishedReleaseListingSelect,
    });
  }

  /**
   * Fetch a single published, non-deleted release with the detail projection
   * (tracks ordered by trackNumber). Returns `null` when missing/unpublished.
   */
  static async findPublishedWithTracks(id: string): Promise<PublishedReleaseDetail | null> {
    return prisma.release.findFirst({
      where: {
        id,
        publishedAt: { not: null },
        OR: [{ deletedOn: null }, { deletedOn: { isSet: false } }],
      },
      include: publishedReleaseDetailInclude,
    });
  }

  /**
   * Fetch other published, non-deleted releases by an artist, excluding the
   * current release. Includes one image for cover-art display. Ordered by
   * `releasedOn` desc.
   */
  static async findPublishedByArtistExcluding(
    artistId: string,
    excludeReleaseId: string
  ): Promise<ReleaseCarouselItem[]> {
    const releases = await prisma.release.findMany({
      where: {
        artistReleases: { some: { artistId } },
        id: { not: excludeReleaseId },
        publishedAt: { not: null },
        OR: [{ deletedOn: null }, { deletedOn: { isSet: false } }],
      },
      orderBy: { releasedOn: 'desc' },
      include: {
        images: {
          orderBy: { sortOrder: 'asc' },
          take: 1,
        },
      },
    });
    return releases as unknown as ReleaseCarouselItem[];
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
    return prisma.release.findFirst({
      where: {
        title: {
          equals: title,
          mode: 'insensitive',
        },
      },
      select: {
        id: true,
        title: true,
        publishedAt: true,
        deletedOn: true,
      },
    });
  }

  /**
   * Fetch the title of a published release by id. Returns null when the
   * release is missing or unpublished.
   */
  static async findPublishedTitleById(id: string): Promise<{ id: string; title: string } | null> {
    return prisma.release.findFirst({
      where: { id, publishedAt: { not: null } },
      select: { id: true, title: true },
    });
  }

  /**
   * Fetch the title of a release by id regardless of publish state.
   */
  static async findTitleById(id: string): Promise<{ id: string; title: string } | null> {
    return prisma.release.findUnique({
      where: { id },
      select: { id: true, title: true },
    });
  }

  /**
   * Lightweight existence check by release id.
   */
  static async existsById(id: string): Promise<boolean> {
    const found = await prisma.release.findUnique({
      where: { id },
      select: { id: true },
    });
    return Boolean(found);
  }
}
