/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import 'server-only';

import { prisma } from '@/lib/prisma';
import type {
  CreateReleaseData,
  PublishedReleaseDetail,
  PublishedReleaseListing,
  PublishedReleaseFilters,
  Release,
  ReleaseCarouselItem,
  ReleaseCoverSource,
  ReleaseCountFilters,
  ReleaseForDeletion,
  ReleaseListFilters,
  ReleaseListItem,
  ReleaseLinkSource,
  UpdateReleaseData,
} from '@/lib/types/domain/release';

import { runQuery } from './_internal/map-prisma-error';

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
  artistReleases: {
    include: {
      artist: true,
    },
  },
} as const satisfies Prisma.ReleaseInclude;

/**
 * Projection for the public releases grid page. Only the fields the listing UI
 * consumes (release cards + search combobox) are selected, keeping both the
 * Mongo read and the API payload small.
 */
const publishedReleaseListingSelect = {
  id: true,
  title: true,
  coverArt: true,
  releasedOn: true,
  images: {
    orderBy: { sortOrder: 'asc' },
    take: 1,
    select: { src: true, altText: true },
  },
  artistReleases: {
    select: {
      artist: {
        // slug feeds the landing headlines' artist links.
        select: { id: true, firstName: true, surname: true, displayName: true, slug: true },
      },
    },
  },
  releaseUrls: {
    select: {
      url: { select: { platform: true, url: true } },
    },
  },
} as const satisfies Prisma.ReleaseSelect;

/**
 * Include for the media player page at /releases/[releaseId]. Artist rows are
 * narrowed to the name-part set consumed by `getArtistDisplayName` — the player
 * never renders artist images/labels/urls or the artist's other releases.
 */
const publishedReleaseDetailInclude = {
  images: {
    orderBy: { sortOrder: 'asc' },
  },
  artistReleases: {
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
        },
      },
    },
  },
  digitalFormats: {
    include: {
      files: {
        orderBy: { trackNumber: 'asc' },
      },
    },
  },
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
type _ReleaseListItemDrift = AssertExact<
  ReleaseListItem,
  Prisma.ReleaseGetPayload<{ include: typeof releaseListItemInclude }>
>;
type _PublishedReleaseListingDrift = AssertExact<
  PublishedReleaseListing,
  Prisma.ReleaseGetPayload<{ select: typeof publishedReleaseListingSelect }>
>;
type _PublishedReleaseDetailDrift = AssertExact<
  PublishedReleaseDetail,
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
    publishedAt: { not: null },
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
};

/**
 * Data-access layer for the Release model and its directly-owned relations
 * (ReleaseUrl, ArtistRelease, and FeaturedArtist cleanup on release delete).
 *
 * The only layer that touches Prisma for releases: it owns the query shapes
 * (includes/selects/where DSL), translates domain input to Prisma input, and
 * wraps every call in `runQuery` so callers see vendor-neutral `DataError`s and
 * hand-written domain types.
 */
export class ReleaseRepository {
  /**
   * Create a new release, returning it with the full detail include
   * (images unbounded, plus artists, digital formats + files, and URLs).
   */
  static async create(data: CreateReleaseData): Promise<Release> {
    return runQuery(() =>
      prisma.release.create({
        data: toPrismaCreate(data),
        include: releaseDetailIncludeUnorderedImages,
      })
    ) as Promise<Release>;
  }

  /**
   * Find a release by id with the full detail include. Images are unbounded
   * and ordered by `sortOrder`. Returns `null` when not found.
   */
  static async findById(id: string): Promise<Release | null> {
    return runQuery(() =>
      prisma.release.findUnique({
        where: { id },
        include: releaseDetailIncludeWithImages,
      })
    ) as Promise<Release | null>;
  }

  /**
   * Find many releases for the admin listing. Builds the filter `where` from
   * domain filters and uses the lightweight listing include (scalars, capped
   * cover-art images, artist join rows) — the grid never renders digital-format
   * files or release URLs. Results ordered by `createdAt` desc.
   */
  static async findMany(filters: ReleaseListFilters): Promise<ReleaseListItem[]> {
    const { skip = 0, take = 50 } = filters;
    return runQuery(() =>
      prisma.release.findMany({
        where: buildListWhere(filters),
        skip,
        take,
        orderBy: { createdAt: 'desc' },
        include: releaseListItemInclude,
      })
    ) as Promise<ReleaseListItem[]>;
  }

  /** Count releases matching an optional published filter (admin dashboard). */
  static async count(filters: ReleaseCountFilters = {}): Promise<number> {
    const where: Prisma.ReleaseWhereInput =
      filters.published === true
        ? { publishedAt: { not: null } }
        : filters.published === false
          ? { OR: [{ publishedAt: null }, { publishedAt: { isSet: false } }] }
          : {};
    return runQuery(() => prisma.release.count({ where }));
  }

  /**
   * Update a release by id with the full detail include (images unbounded,
   * unordered to match the prior payload shape).
   */
  static async update(id: string, data: UpdateReleaseData): Promise<Release> {
    return runQuery(() =>
      prisma.release.update({
        where: { id },
        data: toPrismaUpdate(data),
        include: releaseDetailIncludeUnorderedImages,
      })
    ) as Promise<Release>;
  }

  /**
   * Apply a partial update (used by un-delete/publish and soft-delete flows)
   * without re-hydrating relations. Returns the raw updated release.
   */
  static async updateData(id: string, data: UpdateReleaseData): Promise<Release> {
    return runQuery(() =>
      prisma.release.update({
        where: { id },
        data: toPrismaUpdate(data),
      })
    ) as unknown as Promise<Release>;
  }

  /**
   * Set a release's `deletedOn` to now (soft delete), returning the release
   * with the full detail include (files unordered, matching the prior shape).
   */
  static async softDelete(id: string): Promise<Release> {
    return runQuery(() =>
      prisma.release.update({
        where: { id },
        data: { deletedOn: new Date() },
        include: releaseDetailIncludeUnorderedImages,
      })
    ) as Promise<Release>;
  }

  /**
   * Clear a release's `deletedOn` (restore), returning the release with the
   * full detail include (files unordered, matching the prior shape).
   */
  static async restore(id: string): Promise<Release> {
    return runQuery(() =>
      prisma.release.update({
        where: { id },
        data: { deletedOn: null },
        include: releaseDetailIncludeUnorderedImages,
      })
    ) as Promise<Release>;
  }

  /**
   * Load the S3-cleanup view of a release (digital-format files + images)
   * used to enumerate S3 keys before a hard delete. Returns `null` when the
   * release does not exist.
   */
  static async findForDeletion(id: string): Promise<ReleaseForDeletion | null> {
    return runQuery(() =>
      prisma.release.findUnique({
        where: { id },
        include: releaseForDeletionInclude,
      })
    ) as Promise<ReleaseForDeletion | null>;
  }

  /**
   * Hard delete a release by id (the final step of the delete cascade, after
   * all related records have been removed).
   */
  static async delete(id: string): Promise<Release> {
    return runQuery(() =>
      prisma.release.delete({
        where: { id },
      })
    ) as unknown as Promise<Release>;
  }

  /**
   * Delete all ReleaseUrl junction records for a release.
   */
  static async deleteReleaseUrls(releaseId: string): Promise<void> {
    await runQuery(() => prisma.releaseUrl.deleteMany({ where: { releaseId } }));
  }

  /**
   * Delete all images linked to a release (shared Image model — scoped to this
   * release only). Part of the release delete cascade.
   */
  static async deleteImages(releaseId: string): Promise<void> {
    await runQuery(() => prisma.image.deleteMany({ where: { releaseId } }));
  }

  /**
   * Delete all ArtistRelease junction records for a release (does NOT delete
   * the Artist records themselves).
   */
  static async deleteArtistReleases(releaseId: string): Promise<void> {
    await runQuery(() => prisma.artistRelease.deleteMany({ where: { releaseId } }));
  }

  /**
   * Disconnect FeaturedArtist references to a release (set `releaseId` to null)
   * without deleting the FeaturedArtist records.
   */
  static async clearFeaturedArtistReferences(releaseId: string): Promise<void> {
    await runQuery(() =>
      prisma.featuredArtist.updateMany({
        where: { releaseId },
        data: { releaseId: null },
      })
    );
  }

  /**
   * Fetch a page of published, non-deleted releases for the public listing,
   * building the `where` from an optional search term and using the listing
   * projection. Ordered by `releasedOn` desc.
   */
  static async findPublished(filters: PublishedReleaseFilters): Promise<PublishedReleaseListing[]> {
    const { skip = 0, take = 24, search } = filters;
    return runQuery(() =>
      prisma.release.findMany({
        where: buildPublishedWhere(search),
        orderBy: { releasedOn: 'desc' },
        skip,
        take,
        select: publishedReleaseListingSelect,
      })
    ) as Promise<PublishedReleaseListing[]>;
  }

  /**
   * Fetch a single published, non-deleted release with the detail projection
   * (tracks ordered by trackNumber). Returns `null` when missing/unpublished.
   */
  static async findPublishedWithTracks(id: string): Promise<PublishedReleaseDetail | null> {
    return runQuery(() =>
      prisma.release.findFirst({
        where: {
          id,
          publishedAt: { not: null },
          OR: [{ deletedOn: null }, { deletedOn: { isSet: false } }],
        },
        include: publishedReleaseDetailInclude,
      })
    ) as Promise<PublishedReleaseDetail | null>;
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
    return runQuery(() =>
      prisma.release.findMany({
        where: {
          artistReleases: { some: { artistId } },
          id: { not: excludeReleaseId },
          publishedAt: { not: null },
          OR: [{ deletedOn: null }, { deletedOn: { isSet: false } }],
        },
        orderBy: { releasedOn: 'desc' },
        include: releaseCarouselInclude,
      })
    ) as Promise<ReleaseCarouselItem[]>;
  }

  /**
   * Fetch all published, non-deleted releases for an artist, returning only the
   * `id` and `title` fields ordered newest first.
   * Used by the bio-generation service to inject internal release links after
   * generation (the lambda has no DB access).
   */
  static async findPublishedByArtist(artistId: string): Promise<ReleaseLinkSource[]> {
    return runQuery(() =>
      prisma.release.findMany({
        where: {
          artistReleases: { some: { artistId } },
          publishedAt: { not: null },
          OR: [{ deletedOn: null }, { deletedOn: { isSet: false } }],
        },
        orderBy: { releasedOn: 'desc' },
        select: { id: true, title: true },
      })
    ) as Promise<ReleaseLinkSource[]>;
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
    const releases = await runQuery(() =>
      prisma.release.findMany({
        where: {
          artistReleases: { some: { artistId } },
          publishedAt: { not: null },
          OR: [{ deletedOn: null }, { deletedOn: { isSet: false } }],
        },
        orderBy: { releasedOn: 'desc' },
        select: releaseCoverSourceSelect,
      })
    );
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
    return runQuery(() =>
      prisma.release.findFirst({
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
      })
    );
  }

  /**
   * Fetch the title of a published release by id. Returns null when the
   * release is missing or unpublished.
   */
  static async findPublishedTitleById(id: string): Promise<{ id: string; title: string } | null> {
    return runQuery(() =>
      prisma.release.findFirst({
        where: { id, publishedAt: { not: null } },
        select: { id: true, title: true },
      })
    );
  }

  /**
   * Fetch the title of a release by id regardless of publish state.
   */
  static async findTitleById(id: string): Promise<{ id: string; title: string } | null> {
    return runQuery(() =>
      prisma.release.findUnique({
        where: { id },
        select: { id: true, title: true },
      })
    );
  }

  /**
   * Lightweight existence check by release id.
   */
  static async existsById(id: string): Promise<boolean> {
    const found = await runQuery(() =>
      prisma.release.findUnique({
        where: { id },
        select: { id: true },
      })
    );
    return Boolean(found);
  }
}
