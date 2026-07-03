/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import 'server-only';

import { prisma } from '@/lib/prisma';
import type {
  Artist,
  ArtistListFilters,
  ArtistListWithBio,
  ArtistNameRecord,
  ArtistScalars,
  ArtistWithPublishedReleases,
  CreateArtistData,
  UpdateArtistData,
} from '@/lib/types/domain/artist';
import type { BioStatus } from '@/lib/validation/bio-generation-schema';

import { runQuery } from './_internal/map-prisma-error';

import type { AssertExact } from './_internal/drift';
import type { Prisma } from '@prisma/client';

/** The narrowed projection used by the find-or-create-by-name flow. */
type ArtistNameSelect = {
  id: true;
  displayName: true;
  firstName: true;
  surname: true;
};

/** Count filters for the admin dashboard (Prisma-free at the boundary). */
export interface ArtistCountFilters {
  published?: boolean;
}

/** Bio image row projection used by the save-time full re-host pass. */
export interface BioImageRehostRow {
  id: string;
  url: string;
  thumbnailUrl: string | null;
  originalUrl: string | null;
}

// =============================================================================
// Query shapes (single source of truth for both the query and the drift check)
// =============================================================================

/** Admin listing include — release scalars, capped images, labels, urls. */
const artistAdminInclude = {
  images: { orderBy: { sortOrder: 'asc' }, take: 3 },
  labels: true,
  urls: true,
  releases: { include: { release: true } },
} as const satisfies Prisma.ArtistInclude;

/** Public artists-index include — primary bio images beside the short bio. */
const artistListWithBioInclude = {
  bioImages: { where: { isPrimary: true }, orderBy: { sortOrder: 'asc' }, take: 3 },
} as const satisfies Prisma.ArtistInclude;

/** Public artist-detail include — full nested release + bio graph. */
const artistWithPublishedReleasesInclude = {
  images: true,
  labels: true,
  urls: true,
  bioImages: { orderBy: { sortOrder: 'asc' } },
  bioLinks: { orderBy: { sortOrder: 'asc' } },
  members: { include: { member: true } },
  releases: {
    include: {
      release: {
        include: {
          images: true,
          artistReleases: { include: { artist: true } },
          digitalFormats: { include: { files: { orderBy: { trackNumber: 'asc' } } } },
          releaseUrls: { include: { url: true } },
        },
      },
    },
  },
} as const satisfies Prisma.ArtistInclude;

// Compile-time drift guards: fail `pnpm run typecheck` if a hand-written domain
// type diverges from the Prisma payload its query actually returns.
type _ArtistDrift = AssertExact<
  Artist,
  Prisma.ArtistGetPayload<{ include: typeof artistAdminInclude }>
>;
type _ArtistListWithBioDrift = AssertExact<
  ArtistListWithBio,
  Prisma.ArtistGetPayload<{ include: typeof artistListWithBioInclude }>
>;
type _ArtistWithPublishedReleasesDrift = AssertExact<
  ArtistWithPublishedReleases,
  Prisma.ArtistGetPayload<{ include: typeof artistWithPublishedReleasesInclude }>
>;
const _artistDrift: _ArtistDrift = true;
const _artistListWithBioDrift: _ArtistListWithBioDrift = true;
const _artistWithPublishedReleasesDrift: _ArtistWithPublishedReleasesDrift = true;

// =============================================================================
// Translators (domain input -> Prisma input; the return type is the drift guard)
// =============================================================================

/** Build a Prisma create payload from domain create data. */
const toPrismaCreate = (data: CreateArtistData): Prisma.ArtistCreateInput => {
  const { images, urls, ...scalars } = data;
  return {
    ...scalars,
    ...(images && {
      images: {
        connectOrCreate: images.map((image) => ({
          where: { id: image.id },
          create: { id: image.id, src: image.src, altText: image.altText, caption: image.caption },
        })),
      },
    }),
    ...(urls && {
      urls: {
        connectOrCreate: urls.map((url) => ({
          where: { id: url.id },
          create: {
            id: url.id,
            platform: url.platform as Prisma.UrlCreateInput['platform'],
            url: url.url,
          },
        })),
      },
    }),
  };
};

/** Build a Prisma update payload from domain update data. */
const toPrismaUpdate = (data: UpdateArtistData): Prisma.ArtistUpdateInput => ({ ...data });

/** Build the admin-listing `where` from domain filters (Mongo null-safe). */
const buildListWhere = (filters: ArtistListFilters): Prisma.ArtistWhereInput => {
  const { search, published, deleted } = filters;
  const contains = (value: string) => ({ contains: value, mode: 'insensitive' as const });
  const and: Prisma.ArtistWhereInput[] = [];

  if (!deleted) {
    and.push({ OR: [{ deletedOn: null }, { deletedOn: { isSet: false } }] });
  }
  if (published === true) {
    and.push({ publishedOn: { not: null } });
  } else if (published === false) {
    and.push({ OR: [{ publishedOn: null }, { publishedOn: { isSet: false } }] });
  }
  if (search) {
    and.push({
      OR: [
        { firstName: contains(search) },
        { surname: contains(search) },
        { displayName: contains(search) },
        { slug: contains(search) },
      ],
    });
  }

  return and.length > 0 ? { AND: and } : {};
};

/** Build the public-search `where` from a search term (Mongo null-safe). */
const buildSearchWhere = (search?: string): Prisma.ArtistWhereInput => ({
  isActive: true,
  OR: [{ deletedOn: null }, { deletedOn: { isSet: false } }],
  releases: {
    some: {
      release: {
        publishedAt: { not: null },
        OR: [{ deletedOn: null }, { deletedOn: { isSet: false } }],
      },
    },
  },
  ...(search && {
    AND: [
      {
        OR: [
          { firstName: { contains: search, mode: 'insensitive' as const } },
          { surname: { contains: search, mode: 'insensitive' as const } },
          { displayName: { contains: search, mode: 'insensitive' as const } },
          { slug: { contains: search, mode: 'insensitive' as const } },
          {
            releases: {
              some: {
                release: {
                  title: { contains: search, mode: 'insensitive' as const },
                  publishedAt: { isSet: true },
                  OR: [{ deletedOn: null }, { deletedOn: { isSet: false } }],
                },
              },
            },
          },
        ],
      },
    ],
  }),
});

/**
 * Data-access layer for the Artist and ArtistRelease models. The only layer that
 * touches Prisma for artists: it owns the query shapes (includes/where DSL),
 * translates domain input to Prisma input, and wraps every call in `runQuery`
 * so callers see vendor-neutral `DataError`s and hand-written domain types.
 */
export class ArtistRepository {
  /** Create a new artist, returning the full admin payload. */
  static async create(data: CreateArtistData): Promise<Artist> {
    return runQuery(() =>
      prisma.artist.create({ data: toPrismaCreate(data), include: artistAdminInclude })
    ) as Promise<Artist>;
  }

  /** Find an artist by id, including images ordered by sortOrder. */
  static async findById(id: string): Promise<Artist | null> {
    return runQuery(() =>
      prisma.artist.findUnique({
        where: { id },
        include: { images: { orderBy: { sortOrder: 'asc' } } },
      })
    ) as Promise<Artist | null>;
  }

  /** Find an artist by slug (no relations). */
  static async findBySlug(slug: string): Promise<ArtistScalars | null> {
    return runQuery(() =>
      prisma.artist.findUnique({ where: { slug } })
    ) as Promise<ArtistScalars | null>;
  }

  /**
   * List published, active, non-deleted artists for the public `/artists`
   * index, including their primary bio images. Ordered by display name.
   */
  static async listPublishedWithBio({
    skip,
    take,
  }: {
    skip: number;
    take: number;
  }): Promise<ArtistListWithBio[]> {
    return runQuery(() =>
      prisma.artist.findMany({
        where: {
          isActive: true,
          publishedOn: { not: null },
          OR: [{ deletedOn: null }, { deletedOn: { isSet: false } }],
        },
        orderBy: { displayName: 'asc' },
        skip,
        take,
        include: artistListWithBioInclude,
      })
    );
  }

  /**
   * List artists for the admin listing with the full include shape required by
   * `artistSchema`. Builds the filter `where` from domain filters.
   */
  static async findMany(filters: ArtistListFilters): Promise<Artist[]> {
    const { skip = 0, take = 50 } = filters;
    return runQuery(() =>
      prisma.artist.findMany({
        where: buildListWhere(filters),
        skip,
        take,
        orderBy: { createdAt: 'desc' },
        include: artistAdminInclude,
      })
    ) as Promise<Artist[]>;
  }

  /** Count artists matching an optional published filter (admin dashboard). */
  static async count(filters: ArtistCountFilters = {}): Promise<number> {
    const where: Prisma.ArtistWhereInput =
      filters.published === true
        ? { publishedOn: { not: null } }
        : filters.published === false
          ? { OR: [{ publishedOn: null }, { publishedOn: { isSet: false } }] }
          : {};
    return runQuery(() => prisma.artist.count({ where }));
  }

  /** Update an artist by id, returning the full admin payload. */
  static async update(id: string, data: UpdateArtistData): Promise<Artist> {
    return runQuery(() =>
      prisma.artist.update({
        where: { id },
        data: toPrismaUpdate(data),
        include: artistAdminInclude,
      })
    ) as Promise<Artist>;
  }

  /** Hard-delete an artist by id. */
  static async delete(id: string): Promise<ArtistScalars> {
    return runQuery(() => prisma.artist.delete({ where: { id } })) as Promise<ArtistScalars>;
  }

  /** Soft-delete (archive) an artist by setting deletedOn to now. */
  static async archive(id: string): Promise<ArtistScalars> {
    return runQuery(() =>
      prisma.artist.update({ where: { id }, data: { deletedOn: new Date() } })
    ) as Promise<ArtistScalars>;
  }

  /** Lightweight existence check returning only the id (or null). */
  static async existsById(artistId: string): Promise<{ id: string } | null> {
    return runQuery(() =>
      prisma.artist.findUnique({ where: { id: artistId }, select: { id: true } })
    );
  }

  /**
   * List active, published artists for the public search feature, with the
   * lightweight images/releases include the search UI consumes.
   */
  static async searchPublished({
    search,
    skip = 0,
    take = 50,
  }: ArtistListFilters): Promise<Artist[]> {
    return runQuery(() =>
      prisma.artist.findMany({
        where: buildSearchWhere(search),
        skip,
        take,
        orderBy: { displayName: 'asc' },
        include: {
          images: { orderBy: { sortOrder: 'asc' }, take: 1 },
          releases: {
            include: {
              release: { select: { id: true, title: true, publishedAt: true, deletedOn: true } },
            },
          },
        },
      })
    ) as unknown as Promise<Artist[]>;
  }

  /**
   * Find a single active, published, non-deleted artist by slug with the full
   * nested release + bio include used on the public detail page. The service
   * post-filters releases to published, non-deleted.
   */
  static async findPublishedBySlugWithReleases(
    slug: string
  ): Promise<ArtistWithPublishedReleases | null> {
    return runQuery(() =>
      prisma.artist.findFirst({
        where: {
          slug,
          isActive: true,
          OR: [{ deletedOn: null }, { deletedOn: { isSet: false } }],
        },
        include: artistWithPublishedReleasesInclude,
      })
    );
  }

  /** Find an artist by slug returning the name projection (find-or-create flow). */
  static async findUniqueBySlug(slug: string): Promise<ArtistNameRecord | null> {
    return runQuery(() =>
      prisma.artist.findUnique({ where: { slug }, select: nameSelect })
    ) as Promise<ArtistNameRecord | null>;
  }

  /** Case-insensitive displayName lookup returning the name projection. */
  static async findFirstByDisplayName(displayName: string): Promise<ArtistNameRecord | null> {
    return runQuery(() =>
      prisma.artist.findFirst({
        where: { displayName: { equals: displayName, mode: 'insensitive' } },
        select: nameSelect,
      })
    ) as Promise<ArtistNameRecord | null>;
  }

  /** Case-insensitive firstName + surname lookup returning the name projection. */
  static async findFirstByName(
    firstName: string,
    surname: string
  ): Promise<ArtistNameRecord | null> {
    return runQuery(() =>
      prisma.artist.findFirst({
        where: {
          AND: [
            { firstName: { equals: firstName, mode: 'insensitive' } },
            { surname: { equals: surname, mode: 'insensitive' } },
          ],
        },
        select: nameSelect,
      })
    ) as Promise<ArtistNameRecord | null>;
  }

  /** Create an artist returning only the name projection (find-or-create flow). */
  static async createWithSelect(data: CreateArtistData): Promise<ArtistNameRecord> {
    return runQuery(() =>
      prisma.artist.create({ data: toPrismaCreate(data), select: nameSelect })
    ) as Promise<ArtistNameRecord>;
  }

  /**
   * Replace an artist's AI-generated bio content in a single transaction:
   * overwrite the short/long/alt bio, genres, and provenance fields, then delete
   * and recreate the discovered images/links. Deleting first means a
   * regeneration never leaves stale rows behind. Note: `altBio` is now
   * AI-generated, so regeneration overwrites any hand-authored alt bio.
   */
  static async replaceBioContent(
    artistId: string,
    content: {
      shortBio: string;
      bio: string;
      altBio: string;
      genres: string | null;
      bioModel: string;
      images: Array<{
        url: string;
        thumbnailUrl: string | null;
        title: string | null;
        attribution: string | null;
        license: string | null;
        sourceUrl: string | null;
        originalUrl: string | null;
        width: number | null;
        height: number | null;
        isPrimary: boolean;
        sortOrder: number;
      }>;
      links: Array<{ label: string; url: string; kind: string | null; sortOrder: number }>;
    }
  ): Promise<void> {
    await runQuery(() =>
      prisma.$transaction([
        prisma.artistBioImage.deleteMany({ where: { artistId } }),
        prisma.artistBioLink.deleteMany({ where: { artistId } }),
        prisma.artist.update({
          where: { id: artistId },
          data: {
            shortBio: content.shortBio,
            bio: content.bio,
            altBio: content.altBio,
            genres: content.genres,
            bioModel: content.bioModel,
            bioGeneratedAt: new Date(),
            bioImages: { create: content.images },
            bioLinks: { create: content.links },
          },
        }),
      ])
    );
  }

  /**
   * Update the async bio-generation lifecycle fields. `error`/`startedAt` are
   * only written when explicitly provided so a status flip can leave them alone.
   */
  static async setBioStatus(
    artistId: string,
    status: BioStatus,
    opts: { error?: string | null; startedAt?: Date | null } = {}
  ): Promise<void> {
    await runQuery(() =>
      prisma.artist.update({
        where: { id: artistId },
        data: {
          bioStatus: status,
          ...(opts.error !== undefined ? { bioError: opts.error } : {}),
          ...(opts.startedAt !== undefined ? { bioStartedAt: opts.startedAt } : {}),
        },
      })
    );
  }

  /**
   * Reads the async bio-generation state plus the persisted bio content, so the
   * status endpoint can report progress and hand back the finished bio for the
   * admin form to populate. Returns `null` when the artist does not exist.
   */
  static async getBioGenerationState(artistId: string): Promise<{
    bioStatus: string | null;
    bioError: string | null;
    bioStartedAt: Date | null;
    bioGeneratedAt: Date | null;
    slug: string;
    shortBio: string | null;
    bio: string | null;
    altBio: string | null;
    genres: string | null;
    bioModel: string | null;
    bioImages: Array<{
      id: string;
      url: string;
      thumbnailUrl: string | null;
      title: string | null;
      attribution: string | null;
      license: string | null;
      sourceUrl: string | null;
      originalUrl: string | null;
      isPrimary: boolean;
    }>;
    bioLinks: Array<{ id: string; label: string; url: string; kind: string | null }>;
  } | null> {
    return runQuery(() =>
      prisma.artist.findUnique({
        where: { id: artistId },
        select: {
          bioStatus: true,
          bioError: true,
          bioStartedAt: true,
          bioGeneratedAt: true,
          slug: true,
          shortBio: true,
          bio: true,
          altBio: true,
          genres: true,
          bioModel: true,
          bioImages: {
            orderBy: { sortOrder: 'asc' },
            select: {
              id: true,
              url: true,
              thumbnailUrl: true,
              title: true,
              attribution: true,
              license: true,
              sourceUrl: true,
              originalUrl: true,
              isPrimary: true,
            },
          },
          bioLinks: {
            orderBy: { sortOrder: 'asc' },
            select: { id: true, label: true, url: true, kind: true },
          },
        },
      })
    );
  }

  /** Deletes a single discovered bio link row (palette X). */
  static async deleteBioLink(linkId: string): Promise<void> {
    await prisma.artistBioLink.delete({ where: { id: linkId } });
  }

  /** Deletes a single discovered bio image row (palette X) and returns its
   *  stored URLs so the caller can clean up the CDN thumbnail. */
  static async deleteBioImage(
    imageId: string
  ): Promise<{ url: string; thumbnailUrl: string | null }> {
    const removed = await prisma.artistBioImage.delete({
      where: { id: imageId },
      select: { url: true, thumbnailUrl: true },
    });
    return removed;
  }

  /** Lists an artist's bio image rows with the URLs needed to decide whether a
   *  save-time full re-host is required (thumbnail → originalUrl upgrade). */
  static async findBioImagesForRehost(artistId: string): Promise<BioImageRehostRow[]> {
    return runQuery(() =>
      prisma.artistBioImage.findMany({
        where: { artistId },
        select: { id: true, url: true, thumbnailUrl: true, originalUrl: true },
      })
    );
  }

  /** Points a bio image row at its upgraded (fully re-hosted) CDN URL. */
  static async updateBioImageUrl(imageId: string, url: string): Promise<void> {
    await runQuery(() => prisma.artistBioImage.update({ where: { id: imageId }, data: { url } }));
  }

  /**
   * Idempotently connect an artist to a release via the ArtistRelease join
   * table. Uses upsert to avoid duplicate constraint violations.
   */
  static async connectToRelease(artistId: string, releaseId: string): Promise<void> {
    await runQuery(() =>
      prisma.artistRelease.upsert({
        where: { artistId_releaseId: { artistId, releaseId } },
        update: {},
        create: { artistId, releaseId },
      })
    );
  }
}

/** The narrow name projection select reused by the find-or-create flow. */
const nameSelect: ArtistNameSelect = {
  id: true,
  displayName: true,
  firstName: true,
  surname: true,
};
