/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { z } from 'zod';

import type {
  Artist,
  ArtistWithPublishedReleases,
  FeaturedArtist,
  Format,
  Platform,
  PublishedReleaseDetail,
  PublishedReleaseListing,
  Release,
  ReleaseCarouselItem,
  ReleaseListItem,
} from '@/lib/types/media-models';
import { FORMATS } from '@/lib/types/media-models';
import { jsonValueSchema } from '@/lib/validation/json-schema';

/**
 * Strict Zod schemas mirroring the serialized JSON shapes of the media domain
 * models returned by the public API routes.
 *
 * Two wire-format facts are handled here so runtime values match the
 * Prisma-derived TypeScript types:
 * - `DateTime` fields arrive as ISO strings → `z.coerce.date()` rebuilds `Date`.
 * - `BigInt` fields are serialized to `number` → `z.coerce.bigint()` restores `bigint`.
 */

const date = z.coerce.date();
const nullableDate = z.coerce.date().nullable();
const nullableString = z.string().nullable();

/** Platform enum — matches the Prisma `Platform` enum. */
export const platformSchema = z.enum([
  'SPOTIFY',
  'APPLE_MUSIC',
  'BANDCAMP',
  'YOUTUBE',
  'SOUNDCLOUD',
  'AMAZON_MUSIC',
  'FACEBOOK',
  'TWITTER',
  'INSTAGRAM',
  'BLUESKY',
  'TIKTOK',
  'WEBSITE',
  'PATREON',
  'DISCOGS',
]) satisfies z.ZodType<Platform>;

/** Format enum — matches the Prisma `Format` enum. */
export const formatSchema = z.enum(FORMATS) satisfies z.ZodType<Format>;

/** Full `Image` scalar fields (the shape produced by `images: true`). */
const imageSchema = z.object({
  id: z.string(),
  caption: nullableString,
  artistId: nullableString,
  releaseId: nullableString,
  createdAt: date,
  updatedAt: date,
  src: nullableString,
  altText: nullableString,
  sortOrder: z.number(),
  urlId: nullableString,
});

/** Base `Url` scalar fields (the shape produced by `urls: true` / `url: true`). */
const urlSchema = z.object({
  id: z.string(),
  artistId: nullableString,
  releaseId: nullableString,
  platform: platformSchema,
  url: z.string(),
});

/** `ArtistBioImage` scalars (the shape produced by `bioImages: true`). */
const artistBioImageSchema = z.object({
  id: z.string(),
  artistId: z.string(),
  url: z.string(),
  thumbnailUrl: nullableString,
  title: nullableString,
  attribution: nullableString,
  license: nullableString,
  sourceUrl: nullableString,
  width: z.number().nullable(),
  height: z.number().nullable(),
  isPrimary: z.boolean(),
  sortOrder: z.number(),
  createdAt: date,
});

/** `ArtistBioLink` scalars (the shape produced by `bioLinks: true`). */
const artistBioLinkSchema = z.object({
  id: z.string(),
  artistId: z.string(),
  label: z.string(),
  url: z.string(),
  kind: nullableString,
  sortOrder: z.number(),
});

/** `ArtistLabel` join-row scalars (the shape produced by `labels: true`). */
const artistLabelSchema = z.object({
  id: z.string(),
  artistId: z.string(),
  labelId: z.string(),
});

/** `ReleaseDigitalFormatFile` scalars (file sizes are serialized BigInts). */
const digitalFormatFileSchema = z.object({
  id: z.string(),
  formatId: z.string(),
  trackNumber: z.number(),
  title: nullableString,
  duration: z.number().nullable(),
  s3Key: z.string(),
  fileName: z.string(),
  fileSize: z.coerce.bigint(),
  mimeType: z.string(),
  checksum: nullableString,
  uploadedAt: date,
  createdAt: date,
  updatedAt: date,
  // Runtime-only: `attachStreamUrls` signs a CloudFront URL for non-public
  // formats. Absent for public (MP3 320) files. Preserved (not stripped) so
  // the media player can read it; not part of the Prisma scalar type.
  streamUrl: z.string().nullish(),
});

/** `ReleaseDigitalFormat` with its child files (`digitalFormats: { include: { files } }`). */
const digitalFormatWithFilesSchema = z.object({
  id: z.string(),
  releaseId: z.string(),
  formatType: z.string(),
  s3Key: nullableString,
  fileName: nullableString,
  fileSize: z.coerce.bigint().nullable(),
  mimeType: nullableString,
  trackCount: z.number(),
  totalFileSize: z.coerce.bigint().nullable(),
  checksum: nullableString,
  deletedAt: nullableDate,
  uploadedAt: date,
  createdAt: date,
  updatedAt: date,
  files: z.array(digitalFormatFileSchema),
});

/** All scalar fields of the `Artist` model (no relations included). */
export const artistScalarSchema = z.object({
  id: z.string(),
  firstName: z.string(),
  middleName: nullableString,
  surname: z.string(),
  akaNames: nullableString,
  displayName: nullableString,
  title: nullableString,
  suffix: nullableString,
  phone: nullableString,
  email: nullableString,
  address1: nullableString,
  address2: nullableString,
  city: nullableString,
  state: nullableString,
  postalCode: nullableString,
  country: nullableString,
  bio: nullableString,
  shortBio: nullableString,
  altBio: nullableString,
  bioGeneratedAt: nullableDate,
  bioModel: nullableString,
  slug: z.string(),
  genres: nullableString,
  bornOn: nullableDate,
  diedOn: nullableDate,
  formedOn: nullableDate,
  publishedOn: nullableDate,
  publishedBy: nullableString,
  createdAt: date,
  createdBy: nullableString,
  updatedAt: nullableDate,
  updatedBy: nullableString,
  deletedOn: nullableDate,
  deletedBy: nullableString,
  deactivatedAt: nullableDate,
  deactivatedBy: nullableString,
  reactivatedAt: nullableDate,
  reactivatedBy: nullableString,
  notes: z.array(z.string()),
  tags: nullableString,
  isPseudonymous: z.boolean(),
  isActive: z.boolean(),
  instruments: nullableString,
  featuredArtistId: nullableString,
});

/** All scalar fields of the `Release` model (no relations included). */
const releaseScalarSchema = z.object({
  id: z.string(),
  title: z.string(),
  labels: z.array(z.string()),
  releasedOn: date,
  catalogNumber: nullableString,
  coverArt: z.string(),
  description: nullableString,
  downloadUrls: z.array(z.string()),
  formats: z.array(formatSchema),
  extendedData: z.array(jsonValueSchema),
  notes: z.array(z.string()),
  executiveProducedBy: z.array(z.string()),
  coProducedBy: z.array(z.string()),
  masteredBy: z.array(z.string()),
  mixedBy: z.array(z.string()),
  recordedBy: z.array(z.string()),
  artBy: z.array(z.string()),
  designBy: z.array(z.string()),
  photographyBy: z.array(z.string()),
  linerNotesBy: z.array(z.string()),
  imageTypes: z.array(z.string()),
  variants: z.array(z.string()),
  createdAt: date,
  updatedAt: date,
  deletedOn: nullableDate,
  publishedAt: nullableDate,
  featuredOn: nullableDate,
  featuredUntil: nullableDate,
  featuredDescription: nullableString,
  tagId: nullableString,
  suggestedPrice: z.number().nullable(),
});

/** `Artist` with the relations selected by the `Artist` domain type. */
export const artistSchema = artistScalarSchema.extend({
  images: z.array(imageSchema),
  labels: z.array(artistLabelSchema),
  releases: z.array(
    z.object({
      id: z.string(),
      artistId: z.string(),
      releaseId: z.string(),
      release: releaseScalarSchema,
    })
  ),
  urls: z.array(urlSchema),
}) satisfies z.ZodType<Artist>;

/** `Release` with the relations selected by the `Release` domain type. */
export const releaseSchema = releaseScalarSchema.extend({
  images: z.array(imageSchema),
  artistReleases: z.array(
    z.object({
      id: z.string(),
      artistId: z.string(),
      releaseId: z.string(),
      artist: artistScalarSchema,
    })
  ),
  digitalFormats: z.array(digitalFormatWithFilesSchema),
  releaseUrls: z.array(
    z.object({
      id: z.string(),
      releaseId: z.string(),
      urlId: z.string(),
      url: urlSchema,
    })
  ),
}) satisfies z.ZodType<Release>;

/**
 * Lightweight `Release` for the admin listing — scalars, images, and the
 * artist join rows used to derive the album-artist display name. Excludes the
 * `digitalFormats`/`releaseUrls` relations the grid never renders.
 */
export const releaseListItemSchema = releaseScalarSchema.extend({
  images: z.array(imageSchema),
  artistReleases: z.array(
    z.object({
      id: z.string(),
      artistId: z.string(),
      releaseId: z.string(),
      artist: artistScalarSchema,
    })
  ),
}) satisfies z.ZodType<ReleaseListItem>;

/** `FeaturedArtist` with its nested artists, digital format, and release. */
export const featuredArtistSchema = z.object({
  id: z.string(),
  displayName: nullableString,
  featuredOn: date,
  featuredUntil: nullableDate,
  digitalFormatId: nullableString,
  createdAt: date,
  updatedAt: date,
  publishedOn: nullableDate,
  position: z.number(),
  description: nullableString,
  coverArt: nullableString,
  featuredTrackNumber: z.number().nullable(),
  releaseId: nullableString,
  // Projected to only the fields the carousel/player + display-name/cover-art
  // utils read (see `featuredArtistInclude`), so the schema mirrors the slim
  // payload rather than full Artist/Release documents.
  artists: z.array(
    z.object({
      id: z.string(),
      displayName: nullableString,
      firstName: z.string(),
      surname: z.string(),
      slug: z.string(),
      images: z.array(z.object({ src: nullableString })),
    })
  ),
  digitalFormat: digitalFormatWithFilesSchema.nullable(),
  release: z
    .object({
      id: z.string(),
      title: z.string(),
      coverArt: z.string(),
      images: z.array(z.object({ src: nullableString })),
    })
    .nullable(),
}) satisfies z.ZodType<FeaturedArtist>;

/** Lightweight `Release` with only images, for the related-releases carousel. */
export const releaseCarouselItemSchema = releaseScalarSchema.extend({
  images: z.array(imageSchema),
}) satisfies z.ZodType<ReleaseCarouselItem>;

/** Published release listing projection for the public releases grid. */
export const publishedReleaseListingSchema = z.object({
  id: z.string(),
  title: z.string(),
  coverArt: z.string(),
  releasedOn: date,
  images: z.array(z.object({ src: nullableString, altText: nullableString })),
  artistReleases: z.array(
    z.object({
      artist: z.object({
        id: z.string(),
        firstName: z.string(),
        surname: z.string(),
        displayName: nullableString,
      }),
    })
  ),
  releaseUrls: z.array(z.object({ url: z.object({ platform: platformSchema, url: z.string() }) })),
}) satisfies z.ZodType<PublishedReleaseListing>;

/** `ArtistMember` join row with its included member artist (`members: { include: { member } }`). */
const artistMemberSchema = z.object({
  id: z.string(),
  artistId: z.string(),
  memberId: z.string(),
  member: artistScalarSchema,
});

/** Published release detail (media player page) — the `withTracks` release payload. */
export const publishedReleaseDetailSchema = releaseScalarSchema.extend({
  images: z.array(imageSchema),
  artistReleases: z.array(
    z.object({
      artist: z.object({
        id: z.string(),
        firstName: z.string(),
        middleName: nullableString,
        surname: z.string(),
        displayName: nullableString,
        title: nullableString,
        suffix: nullableString,
      }),
    })
  ),
  digitalFormats: z.array(digitalFormatWithFilesSchema),
  releaseUrls: z.array(
    z.object({
      id: z.string(),
      releaseId: z.string(),
      urlId: z.string(),
      url: urlSchema,
    })
  ),
}) satisfies z.ZodType<PublishedReleaseDetail>;

/** Artist with full published release data, for the public artist detail page. */
export const artistWithPublishedReleasesSchema = artistScalarSchema.extend({
  images: z.array(imageSchema),
  labels: z.array(artistLabelSchema),
  urls: z.array(urlSchema),
  bioImages: z.array(artistBioImageSchema),
  bioLinks: z.array(artistBioLinkSchema),
  members: z.array(artistMemberSchema),
  releases: z.array(
    z.object({
      id: z.string(),
      artistId: z.string(),
      releaseId: z.string(),
      release: releaseSchema,
    })
  ),
}) satisfies z.ZodType<ArtistWithPublishedReleases>;
