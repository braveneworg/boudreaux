/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import type { ImageRecord } from './image';
import type { ArtistReleaseScalars, Release, ReleaseCredit, ReleaseScalars } from './release';
import type { Json } from './shared';
import type { UrlRecord } from './url';

/**
 * Hand-written, Prisma-free mirrors of the Prisma `Artist` graph. Each output
 * type is drift-checked against its `Prisma.ArtistGetPayload` counterpart inside
 * artist-repository, so a schema change that isn't reflected here fails
 * `pnpm run typecheck`.
 */

// =============================================================================
// Output records
// =============================================================================

/**
 * Scalar fields of the Prisma `Artist` model (no relations loaded). Declared as
 * a `type` (not `interface`) so artist payloads remain assignable to
 * `Record<string, unknown>` — the constraint the generic admin `DataView` uses.
 */
export type ArtistScalars = {
  id: string;
  firstName: string;
  middleName: string | null;
  surname: string;
  akaNames: string | null;
  displayName: string | null;
  title: string | null;
  suffix: string | null;
  phone: string | null;
  email: string | null;
  address1: string | null;
  address2: string | null;
  city: string | null;
  state: string | null;
  postalCode: string | null;
  country: string | null;
  bio: string | null;
  shortBio: string | null;
  altBio: string | null;
  bioGeneratedAt: Date | null;
  bioModel: string | null;
  bioStatus: string | null;
  bioError: string | null;
  bioStartedAt: Date | null;
  bioJobToken: string | null;
  bioProgress: Json | null;
  /** Async images-from-links job state (`pending`/`processing`/`succeeded`/`failed`); `null` = never run. */
  imageLinksStatus: string | null;
  imageLinksError: string | null;
  imageLinksStartedAt: Date | null;
  imageLinksJobToken: string | null;
  /** Images the last succeeded images-from-links job added to the pool. */
  imageLinksAddedCount: number | null;
  slug: string;
  genres: string | null;
  bornOn: Date | null;
  diedOn: Date | null;
  formedOn: Date | null;
  publishedOn: Date | null;
  publishedBy: string | null;
  createdAt: Date;
  createdBy: string | null;
  updatedAt: Date | null;
  updatedBy: string | null;
  deletedOn: Date | null;
  deletedBy: string | null;
  deactivatedAt: Date | null;
  deactivatedBy: string | null;
  reactivatedAt: Date | null;
  reactivatedBy: string | null;
  notes: string[];
  tags: string | null;
  isPseudonymous: boolean;
  isActive: boolean;
  instruments: string | null;
  featuredArtistId: string | null;
};

/** Scalar fields of the Prisma `ArtistLabel` join model (`labels: true`). */
export interface ArtistLabelRecord {
  id: string;
  artistId: string;
  labelId: string;
}

/** Scalar fields of the Prisma `ArtistMember` join model. */
export interface ArtistMemberScalars {
  id: string;
  artistId: string;
  memberId: string;
}

/** Scalar fields of the Prisma `ArtistBioImage` model. */
export interface ArtistBioImageRecord {
  id: string;
  artistId: string;
  url: string;
  thumbnailUrl: string | null;
  title: string | null;
  attribution: string | null;
  license: string | null;
  /** Machine-readable license page from Commons, when known. */
  licenseUrl: string | null;
  sourceUrl: string | null;
  /** Original external image URL kept so save-time re-hosting can fetch the full-resolution source. */
  originalUrl: string | null;
  width: number | null;
  height: number | null;
  isPrimary: boolean;
  kind: string | null;
  alt: string | null;
  /** Rekognition face signal: `true`/`false` once analyzed, `null` when not analyzed. */
  hasFace: boolean | null;
  /** Rekognition face-match confidence 0–100, `null` when not analyzed. */
  faceScore: number | null;
  /** SHA-256 (hex) of the source bytes, stamped at re-host; `null` on legacy rows and manual uploads. */
  contentHash: string | null;
  /** 64-bit dHash of the source as 16 hex digits, stamped with `contentHash`. */
  perceptualHash: string | null;
  /** Provenance: `'generated'` (owned by the job), `'custom'` (owned by a human) or `'linked'` (scraped from an admin-supplied page); `null`/missing on legacy rows, read as generated. */
  origin: string | null;
  sortOrder: number;
  /** Human-chosen display position (0-based) among the artist's display images; `null` = not chosen. Never written by regeneration. */
  displayOrder: number | null;
  createdAt: Date;
}

/** Fields for creating one bio image row (manual upload / curated addition). */
export interface CreateArtistBioImageData {
  artistId: string;
  url: string;
  thumbnailUrl?: string | null;
  title?: string | null;
  attribution?: string | null;
  license?: string | null;
  licenseUrl?: string | null;
  sourceUrl?: string | null;
  originalUrl?: string | null;
  width?: number | null;
  height?: number | null;
  isPrimary?: boolean;
  kind?: string | null;
  alt?: string | null;
  /** Rekognition face signal; only the images-from-links path supplies it. */
  hasFace?: boolean | null;
  /** Rekognition face-match confidence 0–100; only the images-from-links path supplies it. */
  faceScore?: number | null;
  /** `'custom'` for the manual-upload path (stamped when absent); `'linked'` for images scraped from admin-supplied pages. */
  origin?: 'custom' | 'linked';
  /** SHA-256 (hex) of the source bytes; only re-hosted images carry it. */
  contentHash?: string | null;
  /** 64-bit dHash of the source as 16 hex digits; only re-hosted images carry it. */
  perceptualHash?: string | null;
}

/**
 * A pool image's content fingerprint — what the re-host dedupe compares new
 * candidates against so a copy served under another URL is still skipped.
 * Rows re-hosted before the hashes were stored carry neither (ADR-0010
 * addendum); the repository omits those.
 */
export interface BioImageFingerprint {
  url: string;
  /** SHA-256 (hex) of the source bytes the row was re-hosted from. */
  contentHash: string | null;
  /** 64-bit dHash of that source as 16 hex digits. */
  perceptualHash: string | null;
}

/** Scalar fields of the Prisma `ArtistBioLink` model. */
export interface ArtistBioLinkRecord {
  id: string;
  artistId: string;
  label: string;
  url: string;
  kind: string | null;
  /** Provenance: `'generated'` (AI discovery) or `'custom'` (admin-authored); `null`/missing on legacy rows, read as generated. */
  origin: string | null;
  sortOrder: number;
  /** Bio reference link role (palette, bio payload, public links); `null`/missing on legacy rows, read as `true`. */
  reference: boolean | null;
  /** Image-source role (read for photos by the images-from-links job); `null`/missing on legacy rows, read as `false`. */
  imageSource: boolean | null;
}

/** Fields for creating one bio link row (admin-authored custom link). */
export interface CreateArtistBioLinkData {
  artistId: string;
  label: string;
  url: string;
  kind?: string | null;
  /** Always `'custom'` for this admin-authored path; the repository stamps it when absent. */
  origin?: 'custom';
  /** Bio reference role; defaults to `true` (the reference-links path). */
  reference?: boolean;
  /** Image-source role; defaults to `false` (the reference-links path). */
  imageSource?: boolean;
}

/**
 * Admin artist payload: scalars plus capped images, label joins, release joins
 * (with release scalars), and platform URLs. Matches the default media `Artist`.
 */
export type Artist = ArtistScalars & {
  images: ImageRecord[];
  labels: ArtistLabelRecord[];
  releases: Array<ArtistReleaseScalars & { release: ReleaseScalars }>;
  urls: UrlRecord[];
};

/** An `ArtistRelease` join row carrying the full media `Release` graph. */
export type ArtistReleaseGraphRow = ArtistReleaseScalars & { release: Release };

/**
 * Repository payload behind the public artist-detail page: scalars plus
 * images, labels, urls, bio images/links, band members (with member scalars),
 * the artist's own release joins, and — via `memberOf` — the release joins of
 * every band the artist belongs to, all carrying the full media `Release`
 * graph. The service flattens this into {@link ArtistWithPublishedReleases}.
 */
export interface ArtistWithReleaseGraph extends ArtistScalars {
  images: ImageRecord[];
  labels: ArtistLabelRecord[];
  urls: UrlRecord[];
  bioImages: ArtistBioImageRecord[];
  bioLinks: ArtistBioLinkRecord[];
  members: Array<ArtistMemberScalars & { member: ArtistScalars }>;
  releases: ArtistReleaseGraphRow[];
  memberOf: Array<
    ArtistMemberScalars & { artist: ArtistScalars & { releases: ArtistReleaseGraphRow[] } }
  >;
}

/**
 * Public artist-detail payload: {@link ArtistWithReleaseGraph} with the band
 * graph folded into `releases` — every published release the artist is on,
 * each tagged with its {@link ReleaseCredit} and listed own-releases-first.
 */
export interface ArtistWithPublishedReleases extends Omit<
  ArtistWithReleaseGraph,
  'memberOf' | 'releases'
> {
  releases: Array<ArtistReleaseGraphRow & { credit: ReleaseCredit }>;
}

/** Sort orders offered by the public artists index. */
export type ArtistListingSort = 'alpha' | 'newest';

/** Pagination, search, and sort for the public artists index. */
export interface ArtistListingFilters {
  /** Case-insensitive term matched against names, aka names, genres, and release titles. */
  search?: string;
  sort: ArtistListingSort;
  skip: number;
  take: number;
}

/** The name projection of a related artist (band member or band) on a listing row. */
export interface ArtistListingName {
  id: string;
  displayName: string | null;
  firstName: string;
  middleName: string | null;
  surname: string;
  title: string | null;
  suffix: string | null;
}

/**
 * The bio-image projection the listing card and search dropdown render. Carries
 * the suggestion flag and the human-chosen position so the service can resolve
 * the artist's display images.
 */
export interface ArtistListingBioImage {
  id: string;
  url: string;
  thumbnailUrl: string | null;
  title: string | null;
  attribution: string | null;
  license: string | null;
  licenseUrl: string | null;
  sourceUrl: string | null;
  alt: string | null;
  isPrimary: boolean;
  displayOrder: number | null;
}

/** Narrow release projection loaded behind every listing-row release join. */
export interface ArtistListingReleaseRecord {
  id: string;
  title: string;
  releasedOn: Date;
  publishedAt: Date | null;
  deletedOn: Date | null;
}

/**
 * Repository payload behind the public artists index: the identifying scalars
 * (never contact details), capped primary bio images, band members, bands the
 * artist belongs to, and the artist's direct release joins carrying the narrow
 * release projection. The service flattens this into {@link ArtistListingRow}.
 */
export interface ArtistListingRecord {
  id: string;
  slug: string;
  firstName: string;
  middleName: string | null;
  surname: string;
  title: string | null;
  suffix: string | null;
  displayName: string | null;
  akaNames: string | null;
  genres: string | null;
  instruments: string | null;
  shortBio: string | null;
  bornOn: Date | null;
  diedOn: Date | null;
  formedOn: Date | null;
  bioImages: ArtistListingBioImage[];
  members: Array<{ member: ArtistListingName }>;
  memberOf: Array<{ artist: ArtistListingName }>;
  releases: Array<{ release: ArtistListingReleaseRecord }>;
}

/** The newest listed release credited to an artist, as shown on the listing row. */
export interface ArtistListingNewestRelease {
  id: string;
  title: string;
  releasedOn: Date;
}

/**
 * Public artists-index row (the wire shape of `/api/artists?listing=published`
 * and the SSR prefetch): {@link ArtistListingRecord} with the release joins
 * summarised into a count plus the newest listed release, and the band joins
 * flattened to their name projections.
 */
export interface ArtistListingRow extends Omit<
  ArtistListingRecord,
  'members' | 'memberOf' | 'releases'
> {
  members: ArtistListingName[];
  memberOf: ArtistListingName[];
  /** Published, non-deleted releases the artist holds a direct credit on. */
  releaseCount: number;
  newestRelease: ArtistListingNewestRelease | null;
}

/**
 * By-id artist payload: scalars plus ordered images only — the shape
 * `ArtistRepository.findById` fetches and `GET /api/artists/[id]` returns
 * (narrower than the admin `Artist`, which also carries labels/urls/releases).
 */
export interface ArtistDetail extends ArtistScalars {
  images: ImageRecord[];
}

/** Narrow release projection loaded for public artist-search matches. */
export interface ArtistSearchReleaseRecord {
  id: string;
  title: string;
  publishedAt: Date | null;
  deletedOn: Date | null;
}

/**
 * Public artist-search match: scalars plus the first image and release joins
 * carrying the narrow release projection the search consumes.
 */
export interface ArtistSearchMatch extends ArtistScalars {
  images: ImageRecord[];
  releases: Array<ArtistReleaseScalars & { release: ArtistSearchReleaseRecord }>;
}

/** Narrow name projection used by the find-or-create-by-name flow. */
export interface ArtistNameRecord {
  id: string;
  displayName: string | null;
  firstName: string;
  surname: string;
}

// =============================================================================
// Input types
// =============================================================================

/** A nested image to connect-or-create when writing an artist. */
export interface ArtistImageInput {
  id: string;
  src: string;
  altText?: string | null;
  caption?: string | null;
}

/** A nested platform URL to connect-or-create when writing an artist. */
export interface ArtistUrlInput {
  id: string;
  platform: string;
  url: string;
}

/** Writable artist scalar fields shared by create/update. */
export interface ArtistWritableData {
  firstName?: string;
  middleName?: string | null;
  surname?: string;
  akaNames?: string | null;
  displayName?: string | null;
  title?: string | null;
  suffix?: string | null;
  bio?: string | null;
  shortBio?: string | null;
  altBio?: string | null;
  slug?: string;
  genres?: string | null;
  tags?: string | null;
  instruments?: string | null;
  isActive?: boolean;
  isPseudonymous?: boolean;
  bornOn?: Date | null;
  diedOn?: Date | null;
  formedOn?: Date | null;
  publishedOn?: Date | null;
  publishedBy?: string | null;
  createdBy?: string | null;
  deletedOn?: Date | null;
}

/** Data accepted by the repository to create an artist. */
export interface CreateArtistData extends ArtistWritableData {
  firstName: string;
  surname: string;
  slug: string;
  images?: ArtistImageInput[];
  urls?: ArtistUrlInput[];
}

/** Data accepted by the repository to update an artist (all fields optional). */
export type UpdateArtistData = ArtistWritableData;

/** Pagination + filters for the admin artist listing. */
export interface ArtistListFilters {
  search?: string;
  published?: boolean;
  deleted?: boolean;
  skip?: number;
  take?: number;
}

/**
 * Artist columns that hold a comma-joined, normalised vocabulary. The
 * vocabulary endpoint takes one of these as its `field` param; `instruments`
 * is the same shape and joins the list whenever a UI wants it.
 */
export const ARTIST_VOCABULARY_FIELDS = ['genres', 'tags'] as const;

/** One of the vocabulary-bearing artist columns. */
export type ArtistVocabularyField = (typeof ARTIST_VOCABULARY_FIELDS)[number];

/** One suggestion: a normalised term and how many artists carry it. */
export interface ArtistVocabularyEntry {
  value: string;
  count: number;
}
