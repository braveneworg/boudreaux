/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import 'server-only';

import { prisma } from '@/lib/prisma';
import type {
  CreateReleaseData,
  PublishedReleaseDetailRow,
  PublishedReleaseListingRow,
  PublishedReleaseFilters,
  Release,
  ReleaseScalars,
  ReleaseCarouselItem,
  ReleaseCoverSource,
  ReleaseCountFilters,
  ReleaseForDeletion,
  ReleaseListFilters,
  ReleaseListItem,
  ReleaseLinkSource,
  UpdateReleaseData,
} from '@/lib/types/domain/release';

import { publicArtistWhere } from './_internal/artist-where';
import { orderedCredits } from './_internal/credit-order';
import { runQuery } from './_internal/map-prisma-error';
import { playableFormats } from './_internal/playable-formats';
import {
  addCredits,
  publishConfirmedCredits,
  syncCredits,
  type CreditPublication,
} from './_internal/release-credits';
import { releasePublishedFilter, releaseWhere } from './_internal/release-where';
import { isPresent } from './_internal/where-kit';

import type { AssertExact } from './_internal/drift';
import type { Prisma } from '@prisma/client';

// =============================================================================
// Query shapes (single source of truth for both the query and the drift check)
// =============================================================================

/**
 * Full detail include for a fully-hydrated release. Mirrors the `Release` domain
 * type (artist info, digital formats + files, release URLs, images). The
 * `images` filter is supplied per-call (bounded for listings, unbounded for
 * detail views), so it is excluded here.
 */
const releaseDetailInclude = {
  artistReleases: orderedCredits({ include: { artist: true } }),
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

/** Full detail include with unbounded, sortOrder-ordered images. */
const releaseDetailIncludeWithImages = {
  images: {
    orderBy: { sortOrder: 'asc' as const },
  },
  ...releaseDetailInclude,
} as const satisfies Prisma.ReleaseInclude;

/**
 * Detail include with unordered, unbounded images — used by create/softDelete/
 * restore to preserve the prior payload shape.
 */
const releaseDetailIncludeUnorderedImages = {
  images: true,
  artistReleases: orderedCredits({ include: { artist: true } }),
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
} as const satisfies Prisma.ReleaseInclude;

/**
 * Include for the admin releases listing. The admin grid only renders release
 * scalars, cover-art images, and the album-artist display name, so the heavy
 * `digitalFormats.files` and `releaseUrls` relations are deliberately omitted.
 */
const releaseListItemInclude = {
  images: {
    orderBy: { sortOrder: 'asc' },
    take: 3,
  },
  artistReleases: orderedCredits({ include: { artist: true } }),
} as const satisfies Prisma.ReleaseInclude;

/**
 * Every credit load is built from {@link orderedCredits}: position 0 is the album
 * artist. Public reads load the FULL credit order with each artist's public
 * gate fields, and the service applies the byline rule (`withPublicByline`)
 * before a row reaches a payload — so a hidden album artist leaves the byline
 * empty instead of handing it to the next credit (ADR-0015).
 */
const publicListingCredits = orderedCredits({
  select: {
    artist: {
      // slug feeds the landing headlines' artist links.
      select: {
        id: true,
        firstName: true,
        surname: true,
        displayName: true,
        slug: true,
        publishedOn: true,
        deletedOn: true,
      },
    },
  },
} as const);

const publicDetailCredits = orderedCredits({
  select: {
    artist: {
      select: {
        id: true,
        firstName: true,
        middleName: true,
        surname: true,
        displayName: true,
        title: true,
        suffix: true,
        publishedOn: true,
        deletedOn: true,
      },
    },
  },
} as const);

const publishedReleaseListingSelect = {
  id: true,
  title: true,
  coverArt: true,
  releasedOn: true,
  description: true,
  formats: true,
  catalogNumber: true,
  images: {
    orderBy: { sortOrder: 'asc' },
    take: 1,
    select: { src: true, altText: true },
  },
  artistReleases: publicListingCredits,
  releaseUrls: {
    select: {
      url: { select: { platform: true, url: true } },
    },
  },
  digitalFormats: playableFormats({
    select: {
      files: { orderBy: { trackNumber: 'asc' }, take: 1, select: { s3Key: true } },
    },
  } as const),
} as const satisfies Prisma.ReleaseSelect;

/**
 * Include for the media player page at /releases/[releaseId]. Artist rows are
 * narrowed to the name-part set consumed by `getArtistDisplayName` — the player
 * never renders artist images/labels/urls or the artist's other releases. The
 * page is public, so it carries only the playable format (`playableFormats`);
 * the download dialog reads the formats on offer from its own query.
 */
const publishedReleaseDetailInclude = {
  images: {
    orderBy: { sortOrder: 'asc' },
  },
  artistReleases: publicDetailCredits,
  digitalFormats: playableFormats({
    include: {
      files: {
        orderBy: { trackNumber: 'asc' },
      },
    },
  } as const),
  releaseUrls: {
    include: {
      url: true,
    },
  },
} as const satisfies Prisma.ReleaseInclude;

/** Carousel include — release scalars plus one cover-art image. */
const releaseCarouselInclude = {
  images: {
    orderBy: { sortOrder: 'asc' },
    take: 1,
  },
} as const satisfies Prisma.ReleaseInclude;

/**
 * Narrow select for bio cover-source rows: id, title, releasedOn, and the
 * first image's `src` for mapping to `coverUrl`. Mirrors the cover-image
 * ordering from `releaseCarouselInclude`.
 */
const releaseCoverSourceSelect = {
  id: true,
  title: true,
  releasedOn: true,
  images: {
    orderBy: { sortOrder: 'asc' as const },
    take: 1,
    select: { src: true },
  },
} as const satisfies Prisma.ReleaseSelect;

/** S3-cleanup include for the pre-delete view (files + images). */
const releaseForDeletionInclude = {
  digitalFormats: {
    include: { files: true },
  },
  images: true,
} as const satisfies Prisma.ReleaseInclude;

// Compile-time drift guards: fail `pnpm run typecheck` if a hand-written domain
// type diverges from the Prisma payload its query actually returns.
type _ReleaseDrift = AssertExact<
  Release,
  Prisma.ReleaseGetPayload<{ include: typeof releaseDetailIncludeWithImages }>
>;
type _ReleaseScalarsDrift = AssertExact<ReleaseScalars, Prisma.ReleaseGetPayload<object>>;
type _ReleaseListItemDrift = AssertExact<
  ReleaseListItem,
  Prisma.ReleaseGetPayload<{ include: typeof releaseListItemInclude }>
>;
type _PublishedReleaseListingDrift = AssertExact<
  PublishedReleaseListingRow,
  Prisma.ReleaseGetPayload<{ select: typeof publishedReleaseListingSelect }>
>;
type _PublishedReleaseDetailDrift = AssertExact<
  PublishedReleaseDetailRow,
  Prisma.ReleaseGetPayload<{ include: typeof publishedReleaseDetailInclude }>
>;
type _ReleaseCarouselItemDrift = AssertExact<
  ReleaseCarouselItem,
  Prisma.ReleaseGetPayload<{ include: typeof releaseCarouselInclude }>
>;
type _ReleaseForDeletionDrift = AssertExact<
  ReleaseForDeletion,
  Prisma.ReleaseGetPayload<{ include: typeof releaseForDeletionInclude }>
>;
const _releaseDrift: _ReleaseDrift = true;
const _releaseScalarsDrift: _ReleaseScalarsDrift = true;
const _releaseListItemDrift: _ReleaseListItemDrift = true;
const _publishedReleaseListingDrift: _PublishedReleaseListingDrift = true;
const _publishedReleaseDetailDrift: _PublishedReleaseDetailDrift = true;
const _releaseCarouselItemDrift: _ReleaseCarouselItemDrift = true;
const _releaseForDeletionDrift: _ReleaseForDeletionDrift = true;

// =============================================================================
// Translators (domain input -> Prisma input; the return type is the drift guard)
// =============================================================================

/** Build a Prisma create payload from domain create data. */
const toPrismaCreate = (data: CreateReleaseData): Prisma.ReleaseCreateInput => ({ ...data });

/** Build a Prisma update payload from domain update data. */
const toPrismaUpdate = (data: UpdateReleaseData): Prisma.ReleaseUpdateInput => ({ ...data });

// =============================================================================
// Where builders (domain filters -> Prisma where; owned by the repository)
// =============================================================================

const containsInsensitive = (value: string) => ({ contains: value, mode: 'insensitive' as const });

/**
 * Build the admin-listing `where` from domain filters. The search OR and the
 * deletedOn OR are combined under `AND` so the two `OR` keys never collide
 * (Prisma 6 + MongoDB null-safe pattern).
 */
const buildListWhere = (filters: ReleaseListFilters): Prisma.ReleaseWhereInput => {
  const { search, artistIds, published, deleted } = filters;
  const and: Prisma.ReleaseWhereInput[] = [];

  if (!deleted) {
    and.push(releaseWhere.notDeleted);
  }
  if (published !== undefined) {
    and.push(releasePublishedFilter(published));
  }
  if (search) {
    and.push({
      OR: [
        { title: containsInsensitive(search) },
        { catalogNumber: containsInsensitive(search) },
        { description: containsInsensitive(search) },
      ],
    });
  }

  return {
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
};

/**
 * Build the public-listing `where` from an optional search term. The deletedOn
 * OR and the search OR are combined under `AND` so they don't collide on the
 * same `OR` key.
 */
const buildPublishedWhere = (search?: string): Prisma.ReleaseWhereInput => {
  const contains = containsInsensitive(search ?? '');
  return {
    ...isPresent('publishedAt'),
    AND: [
      releaseWhere.notDeleted,
      ...(search
        ? [
            {
              OR: [
                { title: contains },
                { catalogNumber: contains },
                { description: contains },
                {
                  // Names match on public artists only, so a search cannot
                  // confirm that a hidden artist exists.
                  artistReleases: {
                    some: {
                      artist: {
                        is: {
                          AND: [
                            publicArtistWhere,
                            {
                              OR: [
                                { firstName: contains },
                                { surname: contains },
                                { displayName: contains },
                              ],
                            },
                          ],
                        },
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
};

export type { CreditPublication } from './_internal/release-credits';

/** What a release update writes with the release, in the same transaction. */
export interface ReleaseCreditsWrite {
  /**
   * The credits to store, in order: the first is the album artist. Absent,
   * the stored credits stay as they are.
   */
  artistIds?: string[];
  /** Set when the update publishes the release: the admin's decisions. */
  publish?: CreditPublication;
}

/**
 * Data-access layer for the Release model and its directly-owned relations
 * (ReleaseUrl, ArtistRelease, and FeaturedArtist cleanup on release delete).
 *
 * The only layer that touches Prisma for releases: it owns the query shapes
 * (includes/selects/where DSL), translates domain input to Prisma input, and
 * returns hand-written domain types; failures surface as vendor-neutral
 * `DataError`s.
 */
export class ReleaseRepository {
  /**
   * Create a release and credit the given artists on it, in order, in one
   * transaction: a failure leaves no release behind, so a retry does not
   * meet its own title. Returns the release with the full detail include
   * (images unbounded, plus artists, digital formats + files, and URLs).
   */
  static async createWithCredits(data: CreateReleaseData, artistIds: string[]): Promise<Release> {
    return runQuery(() =>
      prisma.$transaction(async (tx) => {
        const { id } = await tx.release.create({
          data: toPrismaCreate(data),
          select: { id: true },
        });
        await addCredits(tx, id, artistIds);
        return tx.release.findUniqueOrThrow({
          where: { id },
          include: releaseDetailIncludeUnorderedImages,
        });
      })
    ) as Promise<Release>;
  }

  /**
   * Find a release by id with the full detail include. Images are unbounded
   * and ordered by `sortOrder`. Returns `null` when not found.
   */
  static async findById(id: string): Promise<Release | null> {
    return prisma.release.findUnique({
      where: { id },
      include: releaseDetailIncludeWithImages,
    }) as Promise<Release | null>;
  }

  /**
   * Find many releases for the admin listing. Builds the filter `where` from
   * domain filters and uses the lightweight listing include (scalars, capped
   * cover-art images, artist join rows) — the grid never renders digital-format
   * files or release URLs. Results ordered by `createdAt` desc.
   */
  static async findMany(filters: ReleaseListFilters): Promise<ReleaseListItem[]> {
    const { skip = 0, take = 50 } = filters;
    return prisma.release.findMany({
      where: buildListWhere(filters),
      skip,
      take,
      orderBy: { createdAt: 'desc' },
      include: releaseListItemInclude,
    }) as Promise<ReleaseListItem[]>;
  }

  /**
   * Count releases matching an optional published filter (admin dashboard).
   * Soft-deleted releases never count — the trash view has its own list.
   */
  static async count(filters: ReleaseCountFilters = {}): Promise<number> {
    const and: Prisma.ReleaseWhereInput[] = [releaseWhere.notDeleted];
    if (filters.published !== undefined) {
      and.push(releasePublishedFilter(filters.published));
    }
    return prisma.release.count({ where: { AND: and } });
  }

  /**
   * Update a release, store the credits the write names and publish the
   * artists the admin confirmed, in one transaction (ADR-0015). A release is
   * never left public with half of a save behind it: a failure anywhere,
   * including a {@link CreditDecisionError} from the credit check, keeps
   * none of the write. Returns the release as the transaction left it, with
   * the full detail include (images unbounded, unordered).
   */
  static async updateWithCredits(
    id: string,
    data: UpdateReleaseData,
    { artistIds, publish }: ReleaseCreditsWrite
  ): Promise<Release> {
    return runQuery(() =>
      prisma.$transaction(async (tx) => {
        await tx.release.update({
          where: { id },
          data: toPrismaUpdate(data),
          select: { id: true },
        });
        if (artistIds) {
          await syncCredits(tx, id, artistIds);
        }
        if (publish) {
          await publishConfirmedCredits(tx, id, publish);
        }
        return tx.release.findUniqueOrThrow({
          where: { id },
          include: releaseDetailIncludeUnorderedImages,
        });
      })
    ) as Promise<Release>;
  }

  /**
   * Apply a partial update (used by un-delete/publish and soft-delete flows)
   * without re-hydrating relations. Returns the updated scalars — no
   * relations are loaded, so none are claimed.
   */
  static async updateData(id: string, data: UpdateReleaseData): Promise<ReleaseScalars> {
    return prisma.release.update({
      where: { id },
      data: toPrismaUpdate(data),
    });
  }

  /**
   * Set a release's `deletedOn` to now (soft delete), returning the release
   * with the full detail include (files unordered, matching the prior shape).
   */
  static async softDelete(id: string): Promise<Release> {
    return prisma.release.update({
      where: { id },
      data: { deletedOn: new Date() },
      include: releaseDetailIncludeUnorderedImages,
    }) as Promise<Release>;
  }

  /**
   * Clear a release's `deletedOn` (restore), returning the release with the
   * full detail include (files unordered, matching the prior shape).
   */
  static async restore(id: string): Promise<Release> {
    return prisma.release.update({
      where: { id },
      data: { deletedOn: null },
      include: releaseDetailIncludeUnorderedImages,
    }) as Promise<Release>;
  }

  /**
   * Load the S3-cleanup view of a release (digital-format files + images)
   * used to enumerate S3 keys before a hard delete. Returns `null` when the
   * release does not exist.
   */
  static async findForDeletion(id: string): Promise<ReleaseForDeletion | null> {
    return prisma.release.findUnique({
      where: { id },
      include: releaseForDeletionInclude,
    }) as Promise<ReleaseForDeletion | null>;
  }

  /**
   * Hard delete a release by id (the final step of the delete cascade, after
   * all related records have been removed). Returns the deleted scalars —
   * its relations were removed by the cascade and are not claimed.
   */
  static async delete(id: string): Promise<ReleaseScalars> {
    return prisma.release.delete({ where: { id } });
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
   * building the `where` from an optional search term and using the listing
   * projection. Ordered by `releasedOn` desc.
   */
  static async findPublished(
    filters: PublishedReleaseFilters
  ): Promise<PublishedReleaseListingRow[]> {
    const { skip = 0, take = 24, search } = filters;
    return prisma.release.findMany({
      where: buildPublishedWhere(search),
      orderBy: { releasedOn: 'desc' },
      skip,
      take,
      select: publishedReleaseListingSelect,
    }) as Promise<PublishedReleaseListingRow[]>;
  }

  /**
   * Fetch a single published, non-deleted release with the detail projection
   * (tracks ordered by trackNumber). Returns `null` when missing/unpublished.
   */
  static async findPublishedWithTracks(id: string): Promise<PublishedReleaseDetailRow | null> {
    return prisma.release.findFirst({
      where: { id, ...releaseWhere.listed },
      include: publishedReleaseDetailInclude,
    }) as Promise<PublishedReleaseDetailRow | null>;
  }

  /**
   * Fetch other published, non-deleted releases by a public artist, excluding
   * the current release. Includes one image for cover-art display. Ordered by
   * `releasedOn` desc. A hidden artist's id returns nothing, so the id cannot
   * be used to list a hidden artist's releases.
   */
  static async findPublishedByArtistExcluding(
    artistId: string,
    excludeReleaseId: string
  ): Promise<ReleaseCarouselItem[]> {
    return prisma.release.findMany({
      where: {
        artistReleases: { some: { artistId, artist: { is: publicArtistWhere } } },
        id: { not: excludeReleaseId },
        ...releaseWhere.listed,
      },
      orderBy: { releasedOn: 'desc' },
      include: releaseCarouselInclude,
    }) as Promise<ReleaseCarouselItem[]>;
  }

  /**
   * Fetch all published, non-deleted releases for an artist, returning only the
   * `id` and `title` fields ordered newest first.
   * Used by the bio-generation service to inject internal release links after
   * generation (the lambda has no DB access).
   */
  static async findPublishedByArtist(artistId: string): Promise<ReleaseLinkSource[]> {
    return prisma.release.findMany({
      where: {
        artistReleases: { some: { artistId } },
        ...releaseWhere.listed,
      },
      orderBy: { releasedOn: 'desc' },
      select: { id: true, title: true },
    }) as Promise<ReleaseLinkSource[]>;
  }

  /**
   * Fetch all published, non-deleted releases for an artist with their first
   * cover image projected. Returns `ReleaseCoverSource[]` — id, title,
   * releasedOn, and the first image's `src` as `coverUrl` (null when no image
   * exists). Ordered newest first. Used by the bio-generation service to (a)
   * build the lambda-input releases payload and (b) append rights-cleared
   * cover art to the image palette after generation.
   */
  static async findPublishedByArtistWithCovers(artistId: string): Promise<ReleaseCoverSource[]> {
    const releases = await prisma.release.findMany({
      where: {
        artistReleases: { some: { artistId } },
        ...releaseWhere.listed,
      },
      orderBy: { releasedOn: 'desc' },
      select: releaseCoverSourceSelect,
    });
    return releases.map(({ id, title, releasedOn, images }) => ({
      id,
      title,
      releasedOn,
      coverUrl: images.at(0)?.src ?? null,
    }));
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
   * Fetch the title of a listed release by id. Returns null when the release
   * is missing, unpublished, or soft-deleted.
   */
  static async findPublishedTitleById(id: string): Promise<{ id: string; title: string } | null> {
    return prisma.release.findFirst({
      where: { id, ...releaseWhere.listed },
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
