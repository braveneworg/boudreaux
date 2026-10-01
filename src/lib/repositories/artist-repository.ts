/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import 'server-only';

import { prisma } from '@/lib/prisma';
import type {
  Artist,
  ArtistDetail,
  ArtistListFilters,
  ArtistListingFilters,
  ArtistListingRecord,
  ArtistNameRecord,
  ArtistPublicScalars,
  ArtistScalars,
  ArtistSearchMatch,
  ArtistVocabularyField,
  ArtistWithReleaseGraph,
  CreateArtistData,
  UpdateArtistData,
} from '@/lib/types/domain/artist';
import type { Json } from '@/lib/types/domain/shared';
import { summarizeListedReleases } from '@/lib/utils/artist-release-credits';
import { getArtistDisplayName, type ArtistNameFields } from '@/lib/utils/get-artist-display-name';
import { tokenizeSearchQuery } from '@/lib/utils/tokenize-search-query';
import type { BioProgress, BioStatus } from '@/lib/validation/bio-generation-schema';
import type { AsyncJobStatus } from '@/utils/async-job-lifecycle';

import { artistCreditSelect, artistPublicSelect } from './_internal/artist-public-select';
import { artistWhere, publicArtistWhere } from './_internal/artist-where';
import { bioLinkWhere, bioMediaWhere } from './_internal/bio-media-where';
import { runQuery } from './_internal/map-prisma-error';
import { releaseWhere } from './_internal/release-where';

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

/**
 * The one-field update shapes the enrichment Apply flow may write. A
 * suggestion's `field` maps onto this through an explicit whitelist switch in
 * `ArtistService.applyEnrichedField` — never a dynamic Prisma key.
 */
export interface EnrichedArtistFieldUpdate {
  firstName?: string;
  middleName?: string;
  surname?: string;
  akaNames?: string;
  displayName?: string;
  bornOn?: Date;
}

/**
 * Projection returned by {@link ArtistRepository.getBioGenerationState}: the
 * async lifecycle fields (incl. the latest `bioProgress` checkpoint) plus the
 * persisted bio content the admin form populates from.
 */
export interface BioGenerationStateRecord {
  bioStatus: string | null;
  bioError: string | null;
  bioStartedAt: Date | null;
  bioJobToken: string | null;
  bioProgress: Json | null;
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
    licenseUrl: string | null;
    sourceUrl: string | null;
    originalUrl: string | null;
    width: number | null;
    height: number | null;
    isPrimary: boolean;
    kind: string | null;
    alt: string | null;
    hasFace: boolean | null;
    faceScore: number | null;
    origin: string | null;
    displayOrder: number | null;
  }>;
  bioLinks: Array<{
    id: string;
    label: string;
    url: string;
    kind: string | null;
    origin: string | null;
  }>;
}

/** Projection returned by {@link ArtistRepository.getImageLinksJobState}. */
export interface ImageLinksJobStateRecord {
  slug: string;
  imageLinksStatus: string | null;
  imageLinksError: string | null;
  imageLinksStartedAt: Date | null;
  imageLinksJobToken: string | null;
  imageLinksAddedCount: number | null;
}

// =============================================================================
// Query shapes (single source of truth for both the query and the drift check)
// =============================================================================

/** Admin listing include — release scalars, labels, urls. */
const artistAdminInclude = {
  labels: true,
  urls: true,
  releases: { include: { release: true } },
} as const satisfies Prisma.ArtistInclude;

/** Name projection of a related artist (band member / band) on a listing row. */
const artistListingNameSelect = {
  id: true,
  displayName: true,
  firstName: true,
  middleName: true,
  surname: true,
  title: true,
  suffix: true,
} as const satisfies Prisma.ArtistSelect;

/**
 * Display-image candidates: the human's chosen rows (`displayOrder: { gte: 0 }`
 * matches only numbers — null and absent both fail) or the job's suggested
 * rows. No DB-level take: Mongo sorts nulls first, so a cap here would return
 * unchosen rows; the service resolves and caps after the read.
 */
const displayImageCandidateWhere = {
  OR: [{ displayOrder: { gte: 0 } }, { isPrimary: true }],
} as const satisfies Prisma.ArtistBioImageWhereInput;

/**
 * Public artists-index select — the identifying scalars only (this payload
 * leaves the server, so contact fields are never selected), the display-image
 * candidates, the band graph as name projections, and the artist's
 * direct release joins with the narrow release projection the listing rule and
 * the "newest release" summary read.
 */
const artistListingSelect = {
  id: true,
  slug: true,
  firstName: true,
  middleName: true,
  surname: true,
  title: true,
  suffix: true,
  displayName: true,
  akaNames: true,
  genres: true,
  instruments: true,
  shortBio: true,
  bornOn: true,
  diedOn: true,
  formedOn: true,
  bioImages: {
    where: displayImageCandidateWhere,
    orderBy: { sortOrder: 'asc' },
    select: {
      id: true,
      url: true,
      thumbnailUrl: true,
      title: true,
      attribution: true,
      license: true,
      licenseUrl: true,
      sourceUrl: true,
      alt: true,
      isPrimary: true,
      displayOrder: true,
    },
  },
  // A card names only the members and bands that are public artists (ADR-0015).
  members: {
    where: { member: { is: publicArtistWhere } },
    select: { member: { select: artistListingNameSelect } },
  },
  memberOf: {
    where: { artist: { is: publicArtistWhere } },
    select: { artist: { select: artistListingNameSelect } },
  },
  releases: {
    select: {
      release: {
        select: { id: true, title: true, releasedOn: true, publishedAt: true, deletedOn: true },
      },
    },
  },
} as const satisfies Prisma.ArtistSelect;

/** Public-search include — the display-image candidates behind the dropdown
 * thumbnail plus release joins carrying the narrow release projection the
 * search consumes. */
const artistSearchInclude = {
  bioImages: {
    where: displayImageCandidateWhere,
    orderBy: { sortOrder: 'asc' },
    select: { url: true, thumbnailUrl: true, alt: true, isPrimary: true, displayOrder: true },
  },
  releases: {
    include: {
      release: { select: { id: true, title: true, publishedAt: true, deletedOn: true } },
    },
  },
} as const satisfies Prisma.ArtistInclude;

/**
 * The media `Release` graph loaded behind every artist-detail release join,
 * with each credited artist read through {@link artistCreditSelect}: public
 * scalars (#765) without the bio, plus the fields `isPublicArtist` reads. The
 * credits are read whole, hidden artists included: the service derives each
 * release's credit from the full credit order and drops the hidden artists
 * afterwards (ADR-0015).
 */
const releaseGraphInclude = {
  images: true,
  artistReleases: { include: { artist: { select: artistCreditSelect } } },
  digitalFormats: { include: { files: { orderBy: { trackNumber: 'asc' } } } },
  releaseUrls: { include: { url: true } },
} as const satisfies Prisma.ReleaseInclude;

/** `ArtistRelease` join rows with the release graph — reused for the artist and its bands. */
const artistReleaseRowsInclude = {
  include: { release: { include: releaseGraphInclude } },
} as const satisfies Prisma.Artist$releasesArgs;

/**
 * Public artist-detail select — the public scalars plus the full nested
 * release + bio graph, and the same release graph for every band the artist is
 * a member of so the page can list band releases beside the artist's own. A
 * `select` (not an `include`) so no artist on the graph — the artist, members,
 * bands, or release credits — carries a private scalar. Only the page artist,
 * which the slug read gates on publication, carries its bio; members and bands
 * read through {@link artistCreditSelect}.
 */
const artistWithReleaseGraphSelect = {
  ...artistPublicSelect,
  labels: true,
  urls: true,
  bioImages: { orderBy: { sortOrder: 'asc' } },
  bioLinks: { where: bioLinkWhere.reference, orderBy: { sortOrder: 'asc' } },
  members: { include: { member: { select: artistCreditSelect } } },
  releases: artistReleaseRowsInclude,
  memberOf: {
    include: { artist: { select: { ...artistCreditSelect, releases: artistReleaseRowsInclude } } },
  },
} as const satisfies Prisma.ArtistSelect;

// Compile-time drift guards: fail `pnpm run typecheck` if a hand-written domain
// type diverges from the Prisma payload its query actually returns.
type _ArtistDrift = AssertExact<
  Artist,
  Prisma.ArtistGetPayload<{ include: typeof artistAdminInclude }>
>;
type _ArtistDetailDrift = AssertExact<ArtistDetail, Prisma.ArtistGetPayload<object>>;
type _ArtistListingRecordDrift = AssertExact<
  ArtistListingRecord,
  Prisma.ArtistGetPayload<{ select: typeof artistListingSelect }>
>;
type _ArtistWithReleaseGraphDrift = AssertExact<
  ArtistWithReleaseGraph,
  Prisma.ArtistGetPayload<{ select: typeof artistWithReleaseGraphSelect }>
>;
type _ArtistSearchMatchDrift = AssertExact<
  ArtistSearchMatch,
  Prisma.ArtistGetPayload<{ include: typeof artistSearchInclude }>
>;
const _artistDrift: _ArtistDrift = true;
const _artistDetailDrift: _ArtistDetailDrift = true;
const _artistSearchMatchDrift: _ArtistSearchMatchDrift = true;
const _artistListingRecordDrift: _ArtistListingRecordDrift = true;
const _artistWithReleaseGraphDrift: _ArtistWithReleaseGraphDrift = true;

// =============================================================================
// Translators (domain input -> Prisma input; the return type is the drift guard)
// =============================================================================

/** Build a Prisma create payload from domain create data. */
const toPrismaCreate = (data: CreateArtistData): Prisma.ArtistCreateInput => {
  const { urls, ...scalars } = data;
  return {
    ...scalars,
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

/** Case-insensitive substring filter for one search token. */
const containsToken = (token: string) => ({ contains: token, mode: 'insensitive' as const });

/**
 * The clauses one search token may match among an artist's name fields — every
 * part `getArtistDisplayName` can compose a name from, plus the slug, so a name
 * typed (or picked) as it is displayed always finds its artist.
 */
const nameFieldClauses = (token: string): Prisma.ArtistWhereInput[] => [
  { firstName: containsToken(token) },
  { middleName: containsToken(token) },
  { surname: containsToken(token) },
  { displayName: containsToken(token) },
  { title: containsToken(token) },
  { suffix: containsToken(token) },
  { slug: containsToken(token) },
];

/**
 * Token search shared by the admin and public listings: one OR block per
 * search token, to be ANDed together — every token must match some field, but
 * different tokens may match different fields ("john smith" → firstName +
 * surname). Empty when the search holds nothing searchable.
 */
const buildTokenSearch = (
  search: string,
  clausesFor: (token: string) => Prisma.ArtistWhereInput[]
): Prisma.ArtistWhereInput[] =>
  tokenizeSearchQuery(search).map((token) => ({ OR: clausesFor(token) }));

/** Build the admin-listing `where` from domain filters (Mongo null-safe). */
const buildListWhere = (filters: ArtistListFilters): Prisma.ArtistWhereInput => {
  const { search, published, deleted } = filters;
  const and: Prisma.ArtistWhereInput[] = [];

  if (!deleted) {
    and.push(artistWhere.notDeleted);
  }
  if (published === true) {
    and.push({ publishedOn: { not: null } });
  } else if (published === false) {
    and.push(artistWhere.unpublished);
  }
  if (search) {
    and.push(...buildTokenSearch(search, nameFieldClauses));
  }

  return and.length > 0 ? { AND: and } : {};
};

/** A row of the vocabulary source read — only ever the one selected column. */
type VocabularyRow = { genres?: string | null; tags?: string | null };

/**
 * Per-field Prisma `select` for the vocabulary source read. An exhaustive
 * switch rather than a keyed lookup: the column name never reaches Prisma as
 * a string, and adding a field to `ArtistVocabularyField` makes this function
 * fail to compile instead of silently falling through to another column.
 */
const vocabularySelect = (field: ArtistVocabularyField): Prisma.ArtistSelect => {
  switch (field) {
    case 'genres':
      return { genres: true };
    case 'tags':
      return { tags: true };
  }
};

/** Reads the selected column back off a row, closed over the same fields. */
const readVocabularyColumn = (
  field: ArtistVocabularyField,
  row: VocabularyRow
): string | null | undefined => {
  switch (field) {
    case 'genres':
      return row.genres;
    case 'tags':
      return row.tags;
  }
};

/**
 * Build the `where` shared by the public artists index and the public artist
 * search: a published, non-deleted artist holding a DIRECT credit on at least
 * one listed release (a member credit alone never qualifies — ADR-0007), with
 * an optional case-insensitive token search — every word must match one of
 * the name fields, aka names, genres, or the titles of their listed releases.
 * Whether the artist is still on the label plays no part (ADR-0016).
 *
 * Both reads require the artist to be published: a search that matched a
 * hidden artist would name it (ADR-0015).
 */
const buildListedWhere = (search: string | undefined): Prisma.ArtistWhereInput => {
  const tokenSearch = search
    ? buildTokenSearch(search, (token) => [
        ...nameFieldClauses(token),
        { akaNames: containsToken(token) },
        { genres: containsToken(token) },
        {
          releases: {
            some: { release: { title: containsToken(token), ...releaseWhere.listed } },
          },
        },
      ])
    : [];
  return {
    ...publicArtistWhere,
    releases: { some: { release: releaseWhere.listed } },
    ...(tokenSearch.length > 0 && { AND: tokenSearch }),
  };
};

/**
 * A–Z order for the artists index and the playlist "By artist" search: by the
 * name the artist is displayed under, ignoring letter case and accents, ties by
 * id so paging stays stable.
 */
const compareByDisplayName = (
  a: ArtistNameFields & { id: string },
  b: ArtistNameFields & { id: string }
): number =>
  getArtistDisplayName(a).localeCompare(getArtistDisplayName(b), 'en', {
    sensitivity: 'base',
  }) || a.id.localeCompare(b.id);

/** Epoch millis of an artist's newest listed release; no listed release sorts last. */
const newestListedReleaseTime = (record: ArtistListingRecord): number =>
  summarizeListedReleases(record.releases).newestRelease?.releasedOn.getTime() ?? -Infinity;

/**
 * Newest-release order for the artists index: latest listed release first,
 * ties (and artists without a dated listed release) by display name.
 */
const compareByNewestRelease = (a: ArtistListingRecord, b: ArtistListingRecord): number =>
  newestListedReleaseTime(b) - newestListedReleaseTime(a) ||
  getArtistDisplayName(a).localeCompare(getArtistDisplayName(b));

/** A regenerated bio-link row before it is stamped `origin: 'generated'`. */
type GeneratedLinkInput = { label: string; url: string; kind: string | null; sortOrder: number };

/**
 * Builds the generated bio-link rows to insert during a regeneration: drops any
 * whose URL matches a surviving custom row and any that repeats an earlier URL,
 * so the `@@unique([artistId, url])` index is never violated. Both checks are
 * case-insensitive (matching the custom-survivor set), and the first occurrence
 * of each URL is kept.
 */
const buildGeneratedLinks = (
  links: GeneratedLinkInput[],
  customLinkUrls: Set<string>
): Array<GeneratedLinkInput & { origin: string }> => {
  const seen = new Set<string>();
  return links
    .filter((link) => {
      const key = link.url.toLowerCase();
      if (customLinkUrls.has(key) || seen.has(key)) {
        return false;
      }
      seen.add(key);
      return true;
    })
    .map((link) => ({ ...link, origin: 'generated' }));
};

/**
 * Data-access layer for the Artist and ArtistRelease models. The only layer that
 * touches Prisma for artists: it owns the query shapes (includes/where DSL),
 * translates domain input to Prisma input, and returns hand-written domain
 * types; failures surface as vendor-neutral `DataError`s.
 */
export class ArtistRepository {
  /**
   * Every non-empty value of one vocabulary column across all non-deleted
   * artists, raw and un-split — the source the vocabulary service derives its
   * usage-ranked suggestions from.
   *
   * Published and unpublished artists both count: the suggestions serve the
   * admin form, where an unpublished artist's genres are just as real.
   *
   * Rows written before the column existed have no `deletedOn` at all, which
   * is why the filter is the null-safe fragment.
   */
  static async listVocabularySource(field: ArtistVocabularyField): Promise<string[]> {
    const rows = await prisma.artist.findMany({
      where: artistWhere.notDeleted,
      select: vocabularySelect(field),
    });

    return rows.map((row) => readVocabularyColumn(field, row) ?? '').filter(Boolean);
  }

  /** Create a new artist, returning the full admin payload. */
  static async create(data: CreateArtistData): Promise<Artist> {
    return prisma.artist.create({
      data: toPrismaCreate(data),
      include: artistAdminInclude,
    }) as Promise<Artist>;
  }

  /**
   * Find an artist by id (scalars only). The honest return is `ArtistDetail` —
   * not the admin `Artist`, which also carries labels/urls/releases the by-id
   * shape omits.
   */
  static async findById(id: string): Promise<ArtistDetail | null> {
    return prisma.artist.findUnique({ where: { id } });
  }

  /**
   * Find a published, non-deleted artist by slug (no relations), projected to
   * the public scalars — this backs the public `GET /api/artists/slug/[slug]`.
   * A draft or deleted artist reads as absent (#786).
   */
  static async findBySlug(slug: string): Promise<ArtistPublicScalars | null> {
    return prisma.artist.findFirst({
      where: { slug, ...publicArtistWhere },
      select: artistPublicSelect,
    });
  }

  /**
   * List one page of listed artists for the public `/artists` index —
   * published, non-deleted, and directly credited on a listed release — with
   * the narrow
   * {@link artistListingSelect} projection and an optional search.
   *
   * Neither order can be sorted in the database: `alpha` ranks by the name an
   * artist is displayed under, which is composed from the name parts when no
   * `displayName` is stored (a DB sort on `displayName` files those nulls
   * first, outside the alphabet), and `newest` by each artist's latest listed
   * release, a relation aggregate Prisma on MongoDB cannot sort by. The listed
   * artists are read whole and ordered + sliced here; there are few of them,
   * and ADR-0007 records the revisit trigger.
   */
  static async listListed({
    search,
    sort,
    skip,
    take,
  }: ArtistListingFilters): Promise<ArtistListingRecord[]> {
    const where = buildListedWhere(search);
    const records = await prisma.artist.findMany({ where, select: artistListingSelect });
    const compare = sort === 'alpha' ? compareByDisplayName : compareByNewestRelease;
    return [...records].sort(compare).slice(skip, skip + take);
  }

  /**
   * List artists for the admin listing with the full include shape required by
   * `artistSchema`. Builds the filter `where` from domain filters.
   */
  static async findMany(filters: ArtistListFilters): Promise<Artist[]> {
    const { skip = 0, take = 50 } = filters;
    return prisma.artist.findMany({
      where: buildListWhere(filters),
      skip,
      take,
      orderBy: { createdAt: 'desc' },
      include: artistAdminInclude,
    }) as Promise<Artist[]>;
  }

  /**
   * Count artists matching an optional published filter (admin dashboard).
   * Soft-deleted artists never count — the trash view has its own list.
   */
  static async count(filters: ArtistCountFilters = {}): Promise<number> {
    const and: Prisma.ArtistWhereInput[] = [artistWhere.notDeleted];
    if (filters.published === true) {
      and.push({ publishedOn: { not: null } });
    } else if (filters.published === false) {
      and.push(artistWhere.unpublished);
    }
    return prisma.artist.count({ where: { AND: and } });
  }

  /** Update an artist by id, returning the full admin payload. */
  static async update(id: string, data: UpdateArtistData): Promise<Artist> {
    return prisma.artist.update({
      where: { id },
      data: toPrismaUpdate(data),
      include: artistAdminInclude,
    }) as Promise<Artist>;
  }

  /**
   * Hard-delete an artist by id, removing every row that references it in the
   * same transaction first: catalog joins (labels, releases, featured-artist
   * links, urls, bio images/links, video credits), band memberships in both
   * directions, and artist-scoped gallery Image/Url rows. Prisma emulates
   * `onDelete: Restrict` on MongoDB, so a bare `artist.delete` throws while
   * any required back-relation row still references the artist.
   * (`TourDateHeadliner` declares `onDelete: Cascade` and is emulated by the
   * client on the final delete.)
   */
  static async delete(id: string): Promise<ArtistScalars> {
    return runQuery(() =>
      prisma.$transaction(async (tx) => {
        await tx.artistMember.deleteMany({ where: { OR: [{ artistId: id }, { memberId: id }] } });
        await tx.artistLabel.deleteMany({ where: { artistId: id } });
        await tx.artistRelease.deleteMany({ where: { artistId: id } });
        await tx.artistFeaturedArtist.deleteMany({ where: { artistId: id } });
        await tx.artistUrl.deleteMany({ where: { artistId: id } });
        await tx.artistBioImage.deleteMany({ where: { artistId: id } });
        await tx.artistBioLink.deleteMany({ where: { artistId: id } });
        await tx.videoArtist.deleteMany({ where: { artistId: id } });
        await tx.url.deleteMany({ where: { artistId: id } });
        return tx.artist.delete({ where: { id } });
      })
    ) as Promise<ArtistScalars>;
  }

  /** Soft-delete (archive) an artist by setting deletedOn to now. */
  static async archive(id: string): Promise<ArtistScalars> {
    return prisma.artist.update({
      where: { id },
      data: { deletedOn: new Date() },
    }) as Promise<ArtistScalars>;
  }

  /** Lightweight existence check returning only the id (or null). */
  static async existsById(artistId: string): Promise<{ id: string } | null> {
    return prisma.artist.findUnique({ where: { id: artistId }, select: { id: true } });
  }

  /** Find an artist by id returning only the name projection (or null). */
  static async findNameById(artistId: string): Promise<ArtistNameRecord | null> {
    return prisma.artist.findUnique({
      where: { id: artistId },
      select: nameSelect,
    }) as Promise<ArtistNameRecord | null>;
  }

  /**
   * Search listed artists — published, non-deleted, and holding a
   * direct credit on a listed release (the playlist "By artist" search and the
   * home-page typeahead), with the lightweight images/releases include that
   * search consumes. Matches are ordered by
   * displayed name and sliced here, for the same reason as the index's A–Z
   * order ({@link ArtistRepository.listListed}).
   */
  static async searchPublished({
    search,
    skip = 0,
    take = 50,
  }: ArtistListFilters): Promise<ArtistSearchMatch[]> {
    const matches = await prisma.artist.findMany({
      where: buildListedWhere(search),
      include: artistSearchInclude,
    });
    return [...matches].sort(compareByDisplayName).slice(skip, skip + take);
  }

  /**
   * Find a single published, non-deleted artist by slug with the public
   * scalars and the full nested release + bio graph used on the public detail
   * page (every artist on it projected public), including the releases of
   * every band the artist belongs to. A draft or deleted artist reads as
   * absent (#786). The service folds the band
   * releases in and post-filters members, bands, and releases to published,
   * non-deleted.
   */
  static async findPublishedBySlugWithReleases(
    slug: string
  ): Promise<ArtistWithReleaseGraph | null> {
    return prisma.artist.findFirst({
      where: { slug, ...publicArtistWhere },
      select: artistWithReleaseGraphSelect,
    });
  }

  /**
   * Find the non-deleted artist that owns a slug, returning the name
   * projection (find-or-create flow). A soft-deleted owner is not a match: a
   * name lookup must never hand back an artist that stays hidden (ADR-0015).
   */
  static async findUniqueBySlug(slug: string): Promise<ArtistNameRecord | null> {
    return prisma.artist.findFirst({
      where: { slug, ...artistWhere.notDeleted },
      select: nameSelect,
    }) as Promise<ArtistNameRecord | null>;
  }

  /** Case-insensitive displayName lookup over non-deleted artists (name projection). */
  static async findFirstByDisplayName(displayName: string): Promise<ArtistNameRecord | null> {
    return prisma.artist.findFirst({
      where: {
        displayName: { equals: displayName, mode: 'insensitive' },
        ...artistWhere.notDeleted,
      },
      select: nameSelect,
    }) as Promise<ArtistNameRecord | null>;
  }

  /** Case-insensitive firstName + surname lookup over non-deleted artists (name projection). */
  static async findFirstByName(
    firstName: string,
    surname: string
  ): Promise<ArtistNameRecord | null> {
    return prisma.artist.findFirst({
      where: {
        AND: [
          { firstName: { equals: firstName, mode: 'insensitive' } },
          { surname: { equals: surname, mode: 'insensitive' } },
        ],
        ...artistWhere.notDeleted,
      },
      select: nameSelect,
    }) as Promise<ArtistNameRecord | null>;
  }

  /** Create an artist returning only the name projection (find-or-create flow). */
  static async createWithSelect(data: CreateArtistData): Promise<ArtistNameRecord> {
    return prisma.artist.create({
      data: toPrismaCreate(data),
      select: nameSelect,
    }) as Promise<ArtistNameRecord>;
  }

  /**
   * Replace an artist's AI-generated bio content in a single interactive
   * transaction: overwrite the short/long/alt bio, genres, and provenance fields,
   * then delete and recreate ONLY the generated media, preserving admin-authored
   * (`origin: 'custom'`) images and links so a regeneration never destroys them.
   *
   * The transaction (a) reads the surviving custom rows, (b) deletes generated and
   * legacy rows (`bioMediaWhere.generatedOrLegacy` — legacy rows have `origin`
   * null or absent), then (c) recreates the incoming rows stamped
   * `origin: 'generated'`, skipping any whose URL case-insensitively matches a
   * surviving custom row (the custom copy wins). Note: `altBio` is AI-generated, so
   * regeneration overwrites any hand-authored alt bio.
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
        licenseUrl: string | null;
        sourceUrl: string | null;
        originalUrl: string | null;
        width: number | null;
        height: number | null;
        isPrimary: boolean;
        kind: string | null;
        alt: string | null;
        hasFace: boolean | null;
        faceScore: number | null;
        contentHash?: string | null;
        perceptualHash?: string | null;
        sortOrder: number;
      }>;
      links: Array<{ label: string; url: string; kind: string | null; sortOrder: number }>;
    }
  ): Promise<void> {
    await runQuery(() =>
      prisma.$transaction(
        async (tx) => {
          // (a) Read surviving custom (and, for images, linked) rows so their
          // URLs can shield matching generated rows from re-insertion.
          const [customImages, customLinks] = await Promise.all([
            tx.artistBioImage.findMany({
              where: { artistId, origin: { in: ['custom', 'linked'] } },
              select: { url: true },
            }),
            tx.artistBioLink.findMany({
              where: { artistId, ...bioMediaWhere.custom },
              select: { url: true },
            }),
          ]);

          // (b) Delete generated + legacy rows only; custom and linked rows stay.
          const legacyOrigin = { artistId, ...bioMediaWhere.generatedOrLegacy };
          await tx.artistBioImage.deleteMany({ where: legacyOrigin });
          await tx.artistBioLink.deleteMany({ where: legacyOrigin });

          // (c) Recreate incoming rows as generated, dropping any whose URL matches a
          // surviving custom row (case-insensitive, no normalization beyond lowercasing).
          const customImageUrls = new Set(customImages.map(({ url }) => url.toLowerCase()));
          const customLinkUrls = new Set(customLinks.map(({ url }) => url.toLowerCase()));
          const imagesToCreate = content.images
            .filter((image) => !customImageUrls.has(image.url.toLowerCase()))
            .map((image) => ({ ...image, origin: 'generated' }));
          const linksToCreate = buildGeneratedLinks(content.links, customLinkUrls);

          await tx.artist.update({
            where: { id: artistId },
            data: {
              shortBio: content.shortBio,
              bio: content.bio,
              altBio: content.altBio,
              genres: content.genres,
              bioModel: content.bioModel,
              bioGeneratedAt: new Date(),
              bioImages: { create: imagesToCreate },
              bioLinks: { create: linksToCreate },
            },
          });
        },
        // Regen payload scales with image/link volume; default 5s timeout is too tight.
        { timeout: 15_000, maxWait: 5_000 }
      )
    );
  }

  /**
   * Update the async bio-generation lifecycle fields. `error`/`startedAt` are
   * only written when explicitly provided so a status flip can leave them alone.
   * Marking a run `pending` also clears any prior `bioProgress` so a new run
   * never surfaces the previous run's stage in the polled timeline.
   */
  static async setBioStatus(
    artistId: string,
    status: BioStatus,
    opts: { error?: string | null; startedAt?: Date | null } = {}
  ): Promise<void> {
    await prisma.artist.update({
      where: { id: artistId },
      data: {
        bioStatus: status,
        ...(opts.error !== undefined ? { bioError: opts.error } : {}),
        ...(opts.startedAt !== undefined ? { bioStartedAt: opts.startedAt } : {}),
        ...(status === 'pending' ? { bioProgress: null } : {}),
      },
    });
  }

  /**
   * Persist (or clear, with `null`) the latest async-generation progress
   * checkpoint. Written by the progress channel once it has verified the per-job
   * token; that channel never claims the token (only the completion callback
   * does). `null` clears the field to a DB null.
   */
  static async setBioProgress(artistId: string, progress: BioProgress | null): Promise<void> {
    await prisma.artist.update({
      where: { id: artistId },
      data: { bioProgress: progress },
    });
  }

  /** Set (or clear, with null) the per-job async-callback token for an artist. */
  static async setBioJobToken(artistId: string, token: string | null): Promise<void> {
    await prisma.artist.update({ where: { id: artistId }, data: { bioJobToken: token } });
  }

  /**
   * Atomically claim the async bio job iff the stored token matches AND the job
   * is still processing, clearing the token so only ONE concurrent callback wins.
   * Returns true iff THIS caller claimed it (updateMany count === 1).
   */
  static async claimBioJobToken(artistId: string, token: string): Promise<boolean> {
    const result = await prisma.artist.updateMany({
      where: { id: artistId, bioJobToken: token, bioStatus: 'processing' },
      data: { bioJobToken: null },
    });
    return result.count === 1;
  }

  /**
   * Update the async images-from-links lifecycle fields (independent of the bio
   * job's columns so both can run at once). `error`/`startedAt`/`addedCount`
   * are only written when explicitly provided; marking a run `pending` clears
   * the previous run's `imageLinksAddedCount` so a stale count never toasts.
   */
  static async setImageLinksStatus(
    artistId: string,
    status: AsyncJobStatus,
    opts: { error?: string | null; startedAt?: Date | null; addedCount?: number | null } = {}
  ): Promise<void> {
    await prisma.artist.update({
      where: { id: artistId },
      data: {
        imageLinksStatus: status,
        ...(opts.error !== undefined ? { imageLinksError: opts.error } : {}),
        ...(opts.startedAt !== undefined ? { imageLinksStartedAt: opts.startedAt } : {}),
        ...(opts.addedCount !== undefined ? { imageLinksAddedCount: opts.addedCount } : {}),
        ...(status === 'pending' && opts.addedCount === undefined
          ? { imageLinksAddedCount: null }
          : {}),
      },
    });
  }

  /** Set (or clear, with null) the per-job callback token of the images-from-links job. */
  static async setImageLinksJobToken(artistId: string, token: string | null): Promise<void> {
    await prisma.artist.update({ where: { id: artistId }, data: { imageLinksJobToken: token } });
  }

  /**
   * Atomically claim the images-from-links job iff the stored token matches AND
   * the job is still processing, clearing the token so only ONE concurrent
   * callback wins. Returns true iff THIS caller claimed it.
   */
  static async claimImageLinksJobToken(artistId: string, token: string): Promise<boolean> {
    const result = await prisma.artist.updateMany({
      where: { id: artistId, imageLinksJobToken: token, imageLinksStatus: 'processing' },
      data: { imageLinksJobToken: null },
    });
    return result.count === 1;
  }

  /** Reads the images-from-links job columns (plus slug, for revalidation).
   *  Returns `null` when the artist does not exist. */
  static async getImageLinksJobState(artistId: string): Promise<ImageLinksJobStateRecord | null> {
    return prisma.artist.findUnique({
      where: { id: artistId },
      select: {
        slug: true,
        imageLinksStatus: true,
        imageLinksError: true,
        imageLinksStartedAt: true,
        imageLinksJobToken: true,
        imageLinksAddedCount: true,
      },
    });
  }

  /**
   * Reads the async bio-generation state plus the persisted bio content, so the
   * status endpoint can report progress and hand back the finished bio for the
   * admin form to populate. Returns `null` when the artist does not exist.
   */
  static async getBioGenerationState(artistId: string): Promise<BioGenerationStateRecord | null> {
    return prisma.artist.findUnique({
      where: { id: artistId },
      select: {
        bioStatus: true,
        bioError: true,
        bioStartedAt: true,
        bioJobToken: true,
        bioProgress: true,
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
            licenseUrl: true,
            sourceUrl: true,
            originalUrl: true,
            width: true,
            height: true,
            isPrimary: true,
            kind: true,
            alt: true,
            hasFace: true,
            faceScore: true,
            origin: true,
            displayOrder: true,
          },
        },
        bioLinks: {
          where: bioLinkWhere.reference,
          orderBy: { sortOrder: 'asc' },
          select: { id: true, label: true, url: true, kind: true, origin: true },
        },
      },
    });
  }

  /**
   * Idempotently connect an artist to a release via the ArtistRelease join
   * table. Uses upsert to avoid duplicate constraint violations.
   */
  static async connectToRelease(artistId: string, releaseId: string): Promise<void> {
    await prisma.artistRelease.upsert({
      where: { artistId_releaseId: { artistId, releaseId } },
      update: {},
      create: { artistId, releaseId },
    });
  }

  /** Applies one whitelisted enriched field, stamping `updatedBy` for audit. */
  static async updateEnrichedField(
    artistId: string,
    data: EnrichedArtistFieldUpdate,
    updatedBy: string
  ): Promise<void> {
    await prisma.artist.update({ where: { id: artistId }, data: { ...data, updatedBy } });
  }
}

/** The narrow name projection select reused by the find-or-create flow. */
const nameSelect: ArtistNameSelect = {
  id: true,
  displayName: true,
  firstName: true,
  surname: true,
};
