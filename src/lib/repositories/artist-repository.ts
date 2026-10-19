/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import 'server-only';

import { prisma } from '@/lib/prisma';
import type {
  Artist,
  ArtistBioImageRecord,
  ArtistBioLinkRecord,
  ArtistDetail,
  ArtistHomeSearchMatch,
  ArtistListFilters,
  ArtistListItem,
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
import { summarizeListedReleases } from '@/lib/utils/artist-release-credits';
import { getArtistDisplayName, type ArtistNameFields } from '@/lib/utils/get-artist-display-name';
import { tokenizeSearchQuery } from '@/lib/utils/tokenize-search-query';
import type { BioProgress, BioStatus } from '@/lib/validation/bio-generation-schema';
import type { AsyncJobStatus } from '@/utils/async-job-lifecycle';

import { artistCreditSelect, artistPublicSelect } from './_internal/artist-public-select';
import { artistPublishedFilter, artistWhere } from './_internal/artist-where';
import { mayBeginRunWhere } from './_internal/async-job-where';
import { bioImageWhere, bioLinkWhere, bioMediaWhere } from './_internal/bio-media-where';
import { orderedCredits } from './_internal/credit-order';
import { runQuery } from './_internal/map-prisma-error';
import { playableFormats, playableFormatWhere } from './_internal/playable-formats';
import { renumberCredits } from './_internal/release-credits';
import { publicVideoWhere } from './_internal/video-where';
import { listedRelease, publicArtist } from './_internal/visibility';
import { isUnsetOr } from './_internal/where-kit';

import type { AssertExact } from './_internal/drift';
import type { Prisma } from '@prisma/client';

/** Count filters for the admin dashboard (Prisma-free at the boundary). */
export interface ArtistCountFilters {
  published?: boolean;
}

/**
 * The keys a typed artist name is looked up by (see
 * {@link ArtistRepository.findByNameKeys}). An empty or absent slug, display
 * name or first name skips its step.
 */
export interface ArtistNameKeys {
  slug?: string;
  displayName?: string;
  firstName?: string;
  /** Compared with `firstName`; absent reads as the empty surname of a one-word name. */
  surname?: string;
}

/**
 * Projection returned by {@link ArtistRepository.getBioGenerationState}: the
 * async lifecycle fields (incl. the latest `bioProgress` checkpoint) plus the
 * persisted bio content the admin form populates from.
 */
export type BioGenerationStateRecord = Pick<
  ArtistScalars,
  | 'bioStatus'
  | 'bioError'
  | 'bioStartedAt'
  | 'bioJobToken'
  | 'bioProgress'
  | 'bioGeneratedAt'
  | 'slug'
  | 'shortBio'
  | 'bio'
  | 'altBio'
  | 'genres'
  | 'bioModel'
> & {
  bioImages: Array<
    Pick<
      ArtistBioImageRecord,
      | 'id'
      | 'url'
      | 'thumbnailUrl'
      | 'title'
      | 'attribution'
      | 'license'
      | 'licenseUrl'
      | 'sourceUrl'
      | 'originalUrl'
      | 'width'
      | 'height'
      | 'isPrimary'
      | 'kind'
      | 'alt'
      | 'hasFace'
      | 'faceScore'
      | 'origin'
      | 'displayOrder'
    >
  >;
  bioLinks: Array<Pick<ArtistBioLinkRecord, 'id' | 'label' | 'url' | 'kind' | 'origin'>>;
};

/** Projection returned by {@link ArtistRepository.getImageLinksJobState}. */
export type ImageLinksJobStateRecord = Pick<
  ArtistScalars,
  | 'slug'
  | 'imageLinksStatus'
  | 'imageLinksError'
  | 'imageLinksStartedAt'
  | 'imageLinksJobToken'
  | 'imageLinksAddedCount'
>;

// =============================================================================
// Query shapes (single source of truth for both the query and the drift check)
// =============================================================================

/** Admin payload include — release scalars, labels, urls. */
const artistAdminInclude = {
  labels: true,
  urls: true,
  releases: { include: { release: true } },
} as const satisfies Prisma.ArtistInclude;

/**
 * Admin listing include: the admin payload plus one chosen display image, if
 * any, so the list can say whether the artist may be published (ADR-0019).
 */
const artistListInclude = {
  ...artistAdminInclude,
  bioImages: { where: bioImageWhere.chosen, select: { id: true }, take: 1 },
} as const satisfies Prisma.ArtistInclude;

type ArtistListRow = Prisma.ArtistGetPayload<{ include: typeof artistListInclude }>;

/** The listing row as the admin sees it: the one chosen image becomes a flag. */
const toArtistListItem = ({ bioImages, ...artist }: ArtistListRow): ArtistListItem => ({
  ...artist,
  hasDisplayImage: bioImages.length > 0,
});

/** The name projection the find-or-create-by-name flow reads and creates. */
const artistNameSelect = {
  id: true,
  displayName: true,
  firstName: true,
  surname: true,
} as const satisfies Prisma.ArtistSelect;

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
 * Public artists-index select — the identifying scalars only (this payload
 * leaves the server, so contact fields are never selected), the display-image
 * candidates, the band graph as name projections, and the artist's
 * direct release joins with the narrow release projection the listing rule and
 * the "newest release" summary read, and the release date of each video live
 * at `now` for the "newest" order (ADR-0022).
 */
const artistListingSelect = (now: Date) =>
  ({
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
      where: bioImageWhere.displayCandidate,
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
      where: { member: { is: publicArtist.where } },
      select: { member: { select: artistListingNameSelect } },
    },
    memberOf: {
      where: { artist: { is: publicArtist.where } },
      select: { artist: { select: artistListingNameSelect } },
    },
    releases: {
      select: {
        release: {
          select: {
            id: true,
            title: true,
            releasedOn: true,
            publishedAt: true,
            deletedOn: true,
            // The first MP3 track primes the card's listening modal.
            digitalFormats: playableFormats({
              select: {
                files: { orderBy: { trackNumber: 'asc' }, take: 1, select: { s3Key: true } },
              },
            } as const),
            // The album artist's slug names the release deep link (ADR-0015).
            artistReleases: orderedCredits({
              select: { artist: { select: { slug: true, publishedOn: true, deletedOn: true } } },
            } as const),
          },
        },
      },
    },
    videoArtists: {
      where: { video: { is: publicVideoWhere(now) } },
      select: { video: { select: { releasedOn: true } } },
    },
  }) as const satisfies Prisma.ArtistSelect;

/**
 * Public-search select (ADR-0007): the name fields and slug the dropdown
 * shows, the display-image candidates behind its thumbnail, and release joins
 * carrying the narrow release projection the search consumes — each release's
 * title and the cover art behind its row (`coverArt`, else the first image by
 * sort order, as every public listing resolves it) — and nothing the public
 * may not see.
 */
const artistSearchSelect = {
  ...artistListingNameSelect,
  slug: true,
  bioImages: {
    where: bioImageWhere.displayCandidate,
    orderBy: { sortOrder: 'asc' },
    select: { url: true, thumbnailUrl: true, alt: true, isPrimary: true, displayOrder: true },
  },
  releases: {
    select: {
      release: {
        select: {
          id: true,
          title: true,
          coverArt: true,
          images: { orderBy: { sortOrder: 'asc' }, take: 1, select: { src: true, altText: true } },
          publishedAt: true,
          deletedOn: true,
        },
      },
    },
  },
} as const satisfies Prisma.ArtistSelect;

/**
 * A listed release that can be played: it holds the playable format, not
 * withdrawn, with at least one file. The home search lists only these, since
 * a pick there starts playback at once.
 */
const playableListedReleaseWhere = {
  ...listedRelease.where,
  digitalFormats: { some: { ...playableFormatWhere, files: { some: {} } } },
} as const satisfies Prisma.ReleaseWhereInput;

/**
 * Home-search select: the {@link artistSearchSelect} name fields, slug and
 * display-image candidates, with the artist's playable listed releases in
 * place of its search releases — what a release row shows and the first file
 * its play pick primes — and the artist's video credits on videos live at
 * `now` with what a video row shows and the key its stream URL is signed from.
 */
const artistHomeSearchSelect = (now: Date) =>
  ({
    ...artistSearchSelect,
    releases: {
      where: { release: playableListedReleaseWhere },
      select: {
        release: {
          select: {
            id: true,
            title: true,
            coverArt: true,
            releasedOn: true,
            images: {
              orderBy: { sortOrder: 'asc' },
              take: 1,
              select: { src: true, altText: true },
            },
            digitalFormats: playableFormats({
              select: {
                files: { orderBy: { trackNumber: 'asc' }, take: 1, select: { s3Key: true } },
              },
            } as const),
          },
        },
      },
    },
    videoArtists: {
      where: { video: { is: publicVideoWhere(now) } },
      select: {
        video: {
          select: {
            id: true,
            title: true,
            posterUrl: true,
            releasedOn: true,
            durationSeconds: true,
            s3Key: true,
          },
        },
      },
    },
  }) as const satisfies Prisma.ArtistSelect;

/**
 * The bio-generation state select ({@link ArtistRepository.getBioGenerationState}):
 * the async lifecycle fields, the persisted bio content, the bio images in
 * pool order, and the reference links in order.
 */
const bioGenerationStateSelect = {
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
} as const satisfies Prisma.ArtistSelect;

/**
 * The images-from-links job state select ({@link ArtistRepository.getImageLinksJobState}):
 * the job columns plus the slug, for revalidation.
 */
const imageLinksJobStateSelect = {
  slug: true,
  imageLinksStatus: true,
  imageLinksError: true,
  imageLinksStartedAt: true,
  imageLinksJobToken: true,
  imageLinksAddedCount: true,
} as const satisfies Prisma.ArtistSelect;

/**
 * The media `Release` graph loaded behind every artist-detail release join,
 * with each credited artist read through {@link artistCreditSelect}: public
 * scalars (#765) without the bio, plus the fields `publicArtist.matches`
 * reads. The credits are read whole, hidden artists included: the service
 * derives each release's credit from the full credit order and drops the
 * hidden artists afterwards (ADR-0015). The artist page is public, so each
 * release carries only the playable format (`playableFormats`).
 */
const releaseGraphInclude = {
  images: true,
  artistReleases: orderedCredits({ include: { artist: { select: artistCreditSelect } } }),
  // Track 1 only: the page's latest-release line and the releases page prime
  // the first MP3 track; the listening modal loads the full track list itself.
  digitalFormats: playableFormats({
    include: { files: { orderBy: { trackNumber: 'asc' }, take: 1 } },
  } as const),
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
  Prisma.ArtistGetPayload<{ select: ReturnType<typeof artistListingSelect> }>
>;
type _ArtistWithReleaseGraphDrift = AssertExact<
  ArtistWithReleaseGraph,
  Prisma.ArtistGetPayload<{ select: typeof artistWithReleaseGraphSelect }>
>;
type _ArtistSearchMatchDrift = AssertExact<
  ArtistSearchMatch,
  Prisma.ArtistGetPayload<{ select: typeof artistSearchSelect }>
>;
type _ArtistHomeSearchMatchDrift = AssertExact<
  ArtistHomeSearchMatch,
  Prisma.ArtistGetPayload<{ select: ReturnType<typeof artistHomeSearchSelect> }>
>;
const _artistDrift: _ArtistDrift = true;
const _artistDetailDrift: _ArtistDetailDrift = true;
const _artistSearchMatchDrift: _ArtistSearchMatchDrift = true;
const _artistHomeSearchMatchDrift: _ArtistHomeSearchMatchDrift = true;
const _artistListingRecordDrift: _ArtistListingRecordDrift = true;
const _artistWithReleaseGraphDrift: _ArtistWithReleaseGraphDrift = true;
type _ArtistNameDrift = AssertExact<
  ArtistNameRecord,
  Prisma.ArtistGetPayload<{ select: typeof artistNameSelect }>
>;
type _BioGenerationStateDrift = AssertExact<
  BioGenerationStateRecord,
  Prisma.ArtistGetPayload<{ select: typeof bioGenerationStateSelect }>
>;
type _ImageLinksJobStateDrift = AssertExact<
  ImageLinksJobStateRecord,
  Prisma.ArtistGetPayload<{ select: typeof imageLinksJobStateSelect }>
>;
const _artistNameDrift: _ArtistNameDrift = true;
const _bioGenerationStateDrift: _BioGenerationStateDrift = true;
const _imageLinksJobStateDrift: _ImageLinksJobStateDrift = true;

// =============================================================================
// Translators (domain input -> Prisma input; the return type is the drift guard)
// =============================================================================

/** Build a Prisma create payload from domain create data. */
const toPrismaCreate = (data: CreateArtistData): Prisma.ArtistCreateInput => {
  const { urls, links, ...scalars } = data;
  return {
    ...scalars,
    // A composite is created whole or not at all; `null` means none.
    ...(links ? { links } : {}),
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

/**
 * Build a Prisma update payload from domain update data. The links composite
 * is written whole; a `null` is Prisma's `unset` on an optional composite,
 * and an omitted field stays omitted so the update does not touch it.
 */
const toPrismaUpdate = (data: UpdateArtistData): Prisma.ArtistUpdateInput => {
  const { links, ...rest } = data;
  return {
    ...rest,
    ...(links === undefined ? {} : { links: links ?? { unset: true } }),
  };
};

/** Case-insensitive substring filter for one search token. */
const containsToken = (token: string) => ({ contains: token, mode: 'insensitive' as const });

/** Case-insensitive equality filter for one name field. */
const equalsIgnoringCase = (value: string) => ({ equals: value, mode: 'insensitive' as const });

/**
 * The name lookup's `where`s, in the order they are tried: the slug (unique,
 * most reliable), then the display name, then first name + surname, the last
 * two case-insensitive. A step whose key is empty is left out.
 */
const nameKeyWheres = ({
  slug,
  displayName,
  firstName,
  surname = '',
}: ArtistNameKeys): Prisma.ArtistWhereInput[] => [
  ...(slug ? [{ slug }] : []),
  ...(displayName ? [{ displayName: equalsIgnoringCase(displayName) }] : []),
  ...(firstName
    ? [
        {
          AND: [
            { firstName: equalsIgnoringCase(firstName) },
            { surname: equalsIgnoringCase(surname) },
          ],
        },
      ]
    : []),
];

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
  if (published !== undefined) {
    and.push(artistPublishedFilter(published));
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
 * The clauses one search token may match on a public artist — the name fields,
 * aka names, genres, and the title of one of the artist's listed releases —
 * shared by the playlist "By artist" search, the artists index and the home
 * search.
 */
const publicArtistTokenClauses = (token: string): Prisma.ArtistWhereInput[] => [
  ...nameFieldClauses(token),
  { akaNames: containsToken(token) },
  { genres: containsToken(token) },
  { releases: { some: { release: { title: containsToken(token), ...listedRelease.where } } } },
];

/**
 * Build the playlist "By artist" search `where`: a public artist holding a
 * DIRECT credit on at least one listed release (a member credit alone never
 * qualifies — ADR-0007), with an optional case-insensitive token search —
 * every word must match one of the name fields, aka names, genres, or the
 * titles of their listed releases. The search expands each match into its
 * release tracks, so an artist with only videos has nothing to offer it.
 *
 * It requires a public artist: a search that matched a hidden artist would
 * name it (ADR-0015).
 */
const buildReleaseCreditedWhere = (search: string | undefined): Prisma.ArtistWhereInput => {
  const tokenSearch = search ? buildTokenSearch(search, publicArtistTokenClauses) : [];
  return {
    releases: { some: { release: listedRelease.where } },
    AND: [publicArtist.where, ...tokenSearch],
  };
};

/**
 * Build the `where` for a public artist with a direct credit on a release
 * matching `creditedRelease` or a video credit on a video live at `now`, with
 * an optional token search: every word must match one of the name fields, aka
 * names, genres, the title of a listed release, or the title of a live video.
 * Whether the artist is still on the label plays no part (ADR-0016).
 *
 * `publicArtist.where`, the credit `OR` and each token's `OR` sit in `AND`
 * members, so no two of them meet on one key. The credit comes last: Prisma on
 * MongoDB joins a relation once per filter under one alias, and the last join
 * replaces the earlier ones, so the filter that joins deepest (the credit, down
 * to the format files for the home search) must be the last to read `releases`
 * (docs/lessons/prisma-mongo/same-relation-filters-share-one-join.md).
 */
const buildReleaseOrVideoWhere = (
  search: string | undefined,
  now: Date,
  creditedRelease: Prisma.ReleaseWhereInput
): Prisma.ArtistWhereInput => {
  const liveVideo = publicVideoWhere(now);
  const tokenSearch = search
    ? buildTokenSearch(search, (token) => [
        ...publicArtistTokenClauses(token),
        {
          videoArtists: { some: { video: { is: { title: containsToken(token), ...liveVideo } } } },
        },
      ])
    : [];
  return {
    AND: [
      publicArtist.where,
      ...tokenSearch,
      {
        OR: [
          { releases: { some: { release: creditedRelease } } },
          { videoArtists: { some: { video: { is: liveVideo } } } },
        ],
      },
    ],
  };
};

/**
 * Build the public artists index `where` (a **listed artist**, ADR-0022): a
 * public artist with a direct credit on a listed release or a video credit on
 * a live video. See {@link buildReleaseOrVideoWhere}.
 */
const buildListedWhere = (search: string | undefined, now: Date): Prisma.ArtistWhereInput =>
  buildReleaseOrVideoWhere(search, now, listedRelease.where);

/**
 * Build the home search `where` (a **home search match**): like
 * {@link buildListedWhere}, but the release credit must be on a playable
 * listed release. A title match on a listed release that cannot be played
 * still finds an artist that qualifies some other way. See
 * {@link buildReleaseOrVideoWhere}.
 */
const buildHomeSearchWhere = (search: string | undefined, now: Date): Prisma.ArtistWhereInput =>
  buildReleaseOrVideoWhere(search, now, playableListedReleaseWhere);

/** Epoch millis of a video's release date; an undated video sorts last. */
const videoReleasedTime = ({ releasedOn }: { releasedOn: Date | null }): number =>
  releasedOn?.getTime() ?? -Infinity;

/** A home search match's videos: newest release date first, ties by title. */
const compareVideoCredits = (
  { video: a }: { video: { title: string; releasedOn: Date | null } },
  { video: b }: { video: { title: string; releasedOn: Date | null } }
): number => videoReleasedTime(b) - videoReleasedTime(a) || a.title.localeCompare(b.title);

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

/**
 * Epoch millis of an artist's newest work: the later of its newest listed
 * release and its newest live video. An artist with neither dated sorts last.
 */
const newestWorkTime = ({ releases, videoArtists }: ArtistListingRecord): number =>
  Math.max(
    summarizeListedReleases(releases).newestRelease?.releasedOn.getTime() ?? -Infinity,
    ...videoArtists.map(({ video }) => videoReleasedTime(video))
  );

/**
 * Newest order for the artists index (ADR-0022): the artist with the latest
 * listed release or live video first, ties (and artists with nothing dated)
 * by display name.
 */
const compareByNewest = (a: ArtistListingRecord, b: ArtistListingRecord): number =>
  newestWorkTime(b) - newestWorkTime(a) ||
  getArtistDisplayName(a).localeCompare(getArtistDisplayName(b));

/** A regenerated bio-link row before it is stamped `origin: 'generated'`. */
type GeneratedLinkInput = { label: string; url: string; kind: string | null; sortOrder: number };

/**
 * Genres are human-owned (ADR-0009): a bio generation job's genres fill only a
 * field that is blank NOW. One conditional write decides it against the row as
 * it is, not against the snapshot sent to the Lambda at dispatch, so an admin
 * who set genres while the run was in flight keeps them, and a run that
 * produced none clears nothing. Proved by `artist-bio-content.contract.spec.ts`.
 */
const fillBlankGenres = async (
  tx: { artist: Pick<typeof prisma.artist, 'updateMany'> },
  artistId: string,
  genres: string | null
): Promise<void> => {
  if (!genres) return;
  await tx.artist.updateMany({
    where: { id: artistId, ...isUnsetOr('genres', '') },
    data: { genres },
  });
};

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

/** Who an update records as the artist's publisher, on its first publish. */
export interface ArtistPublisher {
  publishedBy?: string;
}

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
      where: { slug, ...publicArtist.where },
      select: artistPublicSelect,
    });
  }

  /**
   * List one page of listed artists for the public `/artists` index —
   * published, non-deleted, and directly credited on a listed release or
   * credited on a live video ({@link buildListedWhere}, ADR-0022) — with the
   * narrow {@link artistListingSelect} projection and an optional search. One
   * `now` decides what is live for the whole read.
   *
   * Neither order can be sorted in the database: `alpha` ranks by the name an
   * artist is displayed under, which is composed from the name parts when no
   * `displayName` is stored (a DB sort on `displayName` files those nulls
   * first, outside the alphabet), and `newest` by the later of each artist's
   * latest listed release and latest live video (ADR-0022), an aggregate over
   * two relations Prisma on MongoDB cannot sort by. The listed
   * artists are read whole and ordered + sliced here; there are few of them,
   * and ADR-0007 records the revisit trigger.
   */
  static async listListed({
    search,
    sort,
    skip,
    take,
  }: ArtistListingFilters): Promise<ArtistListingRecord[]> {
    const now = new Date();
    const records = await prisma.artist.findMany({
      where: buildListedWhere(search, now),
      select: artistListingSelect(now),
    });
    const compare = sort === 'alpha' ? compareByDisplayName : compareByNewest;
    return [...records].sort(compare).slice(skip, skip + take);
  }

  /**
   * List artists for the admin listing in the shape `artistListItemSchema`
   * parses: the full admin include plus the display-image flag (ADR-0019).
   * Builds the filter `where` from domain filters.
   */
  static async findMany(filters: ArtistListFilters): Promise<ArtistListItem[]> {
    const { skip = 0, take = 50 } = filters;
    const rows = await prisma.artist.findMany({
      where: buildListWhere(filters),
      skip,
      take,
      orderBy: { createdAt: 'desc' },
      include: artistListInclude,
    });
    return rows.map(toArtistListItem);
  }

  /**
   * Count artists matching an optional published filter (admin dashboard),
   * through the admin listing's {@link buildListWhere}. Soft-deleted artists
   * never count — the trash view has its own list.
   */
  static async count({ published }: ArtistCountFilters = {}): Promise<number> {
    return prisma.artist.count({ where: buildListWhere({ published }) });
  }

  /**
   * Update an artist by id, returning the full admin payload. When the write
   * sets `publishedOn`, `publishedBy` records the given admin, but only if the
   * stored artist is not published yet: a save of a public artist sends its
   * date again and must not change who published it (ADR-0015). The stamp and
   * the update share one transaction.
   */
  static async update(
    id: string,
    data: UpdateArtistData,
    { publishedBy }: ArtistPublisher = {}
  ): Promise<Artist> {
    if (!data.publishedOn || !publishedBy) {
      return prisma.artist.update({
        where: { id },
        data: toPrismaUpdate(data),
        include: artistAdminInclude,
      }) as Promise<Artist>;
    }
    return runQuery(() =>
      prisma.$transaction(async (tx) => {
        await tx.artist.updateMany({
          where: { id, ...artistWhere.unpublished },
          data: { publishedBy },
        });
        return tx.artist.update({
          where: { id },
          data: toPrismaUpdate(data),
          include: artistAdminInclude,
        });
      })
    ) as Promise<Artist>;
  }

  /**
   * Hard-delete an artist by id, removing every row that references it in the
   * same transaction first: catalog joins (labels, releases, featured-artist
   * links, urls, bio images/links, video credits), band memberships in both
   * directions, and artist-scoped gallery Image/Url rows. Prisma emulates
   * `onDelete: Restrict` on MongoDB, so a bare `artist.delete` throws while
   * any required back-relation row still references the artist. Each
   * release the artist was credited on keeps its remaining credits numbered
   * 0..n-1.
   * (`TourDateHeadliner` declares `onDelete: Cascade` and is emulated by the
   * client on the final delete.)
   */
  static async delete(id: string): Promise<ArtistScalars> {
    return runQuery(() =>
      prisma.$transaction(async (tx) => {
        await tx.artistMember.deleteMany({ where: { OR: [{ artistId: id }, { memberId: id }] } });
        await tx.artistLabel.deleteMany({ where: { artistId: id } });
        const credited = await tx.artistRelease.findMany({
          where: { artistId: id },
          select: { releaseId: true },
        });
        await tx.artistRelease.deleteMany({ where: { artistId: id } });
        for (const { releaseId } of credited) {
          await renumberCredits(tx, releaseId);
        }
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

  /** Whether an artist has the id, read through its id alone. */
  static async existsById(artistId: string): Promise<boolean> {
    const found = await prisma.artist.findUnique({ where: { id: artistId }, select: { id: true } });
    return found !== null;
  }

  /** Find an artist by id returning only the name projection (or null). */
  static async findNameById(artistId: string): Promise<ArtistNameRecord | null> {
    return prisma.artist.findUnique({ where: { id: artistId }, select: artistNameSelect });
  }

  /**
   * Search the artists holding a direct credit on a listed release
   * ({@link buildReleaseCreditedWhere}, the playlist "By artist" search —
   * narrower than the artists index, which also lists artists with only live
   * videos), with
   * the lightweight images/releases include that
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
      where: buildReleaseCreditedWhere(search),
      select: artistSearchSelect,
    });
    return [...matches].sort(compareByDisplayName).slice(skip, skip + take);
  }

  /**
   * Search the home page's matches ({@link buildHomeSearchWhere}): public
   * artists with a direct credit on a playable listed release or a video
   * credit on a live video, each with all of its playable listed releases
   * and all of its live videos (newest first). One `now` decides what is
   * live for the whole read. Matches are ordered by displayed name and
   * sliced here, as {@link ArtistRepository.searchPublished} does.
   */
  static async searchForHomeNav({
    search,
    skip = 0,
    take = 50,
  }: Pick<ArtistListFilters, 'search' | 'skip' | 'take'>): Promise<ArtistHomeSearchMatch[]> {
    const now = new Date();
    const matches = await prisma.artist.findMany({
      where: buildHomeSearchWhere(search, now),
      select: artistHomeSearchSelect(now),
    });
    return [...matches]
      .sort(compareByDisplayName)
      .slice(skip, skip + take)
      .map((match) => ({
        ...match,
        videoArtists: [...match.videoArtists].sort(compareVideoCredits),
      }));
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
      where: { slug, ...publicArtist.where },
      select: artistWithReleaseGraphSelect,
    });
  }

  /**
   * Find the artist a typed name refers to (the find-or-create flow and the
   * admin name lookup), trying its keys in order — the slug, then the display
   * name, then first name + surname ({@link nameKeyWheres}) — and returning
   * the first match's name projection, or `null`. Only non-deleted artists
   * match on any key: a name lookup must never hand back an artist that stays
   * hidden (ADR-0015).
   */
  static async findByNameKeys(keys: ArtistNameKeys): Promise<ArtistNameRecord | null> {
    for (const where of nameKeyWheres(keys)) {
      const match = await prisma.artist.findFirst({
        where: { ...where, ...artistWhere.notDeleted },
        select: artistNameSelect,
      });
      if (match) {
        return match;
      }
    }
    return null;
  }

  /** Create an artist returning only the name projection (find-or-create flow). */
  static async createWithSelect(data: CreateArtistData): Promise<ArtistNameRecord> {
    return prisma.artist.create({ data: toPrismaCreate(data), select: artistNameSelect });
  }

  /**
   * Replace an artist's AI-generated bio content in a single interactive
   * transaction: overwrite the short/long/alt bio and provenance fields, fill
   * genres only while the stored field is blank (ADR-0009), then delete and
   * recreate ONLY the generated media, preserving admin-authored
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
              bioModel: content.bioModel,
              bioGeneratedAt: new Date(),
              bioImages: { create: imagesToCreate },
              bioLinks: { create: linksToCreate },
            },
          });

          // (d) Genres are human-owned (ADR-0009): fill only a blank field.
          await fillBlankGenres(tx, artistId, content.genres);
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
   * Begin a bio-generation run with one conditional write: the job flips to
   * `processing` and records its start unless it is already `processing` with
   * a fresh start (`mayBeginRunWhere` — the runner gate as a `where`). Two
   * runners racing for one job both pass a read; only one passes this write.
   * Returns true iff THIS caller began it.
   */
  static async beginBioRun(artistId: string, now: Date): Promise<boolean> {
    const result = await prisma.artist.updateMany({
      where: { id: artistId, AND: [mayBeginRunWhere('bioStatus', 'bioStartedAt', now)] },
      data: { bioStatus: 'processing', bioStartedAt: now, bioError: null },
    });
    return result.count === 1;
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

  /** Begin an images-from-links run with one conditional write; see {@link beginBioRun}. */
  static async beginImageLinksRun(artistId: string, now: Date): Promise<boolean> {
    const result = await prisma.artist.updateMany({
      where: {
        id: artistId,
        AND: [mayBeginRunWhere('imageLinksStatus', 'imageLinksStartedAt', now)],
      },
      data: { imageLinksStatus: 'processing', imageLinksStartedAt: now, imageLinksError: null },
    });
    return result.count === 1;
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
    return prisma.artist.findUnique({ where: { id: artistId }, select: imageLinksJobStateSelect });
  }

  /**
   * Reads the async bio-generation state plus the persisted bio content, so the
   * status endpoint can report progress and hand back the finished bio for the
   * admin form to populate. Returns `null` when the artist does not exist.
   */
  static async getBioGenerationState(artistId: string): Promise<BioGenerationStateRecord | null> {
    return prisma.artist.findUnique({ where: { id: artistId }, select: bioGenerationStateSelect });
  }
}
