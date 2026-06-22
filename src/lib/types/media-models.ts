/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import type {
  Artist,
  ArtistListWithBio,
  ArtistWithPublishedReleases,
} from '@/lib/types/domain/artist';
import type {
  PublishedReleaseDetail,
  PublishedReleaseListing,
  Release,
  ReleaseCarouselItem,
  ReleaseListItem,
} from '@/lib/types/domain/release';
import type { Platform } from '@/lib/types/domain/shared';

import type { Prisma } from '@prisma/client';

/**
 * Media model types that match the models in prisma/schema.prisma
 * These types are shared across the application for audio/media-related features
 */

// Vendor-neutral primitives now live in the Prisma-free domain layer. Re-exported
// here so existing importers keep working until they migrate to `@/lib/types/domain`.
export { FORMATS } from '@/lib/types/domain/shared';
export type { Format, Json, Platform } from '@/lib/types/domain/shared';

// Artist types are now hand-written, Prisma-free domain types (drift-checked in
// artist-repository). Imported above for local use, re-exported for back-compat.
export type { Artist, ArtistListWithBio, ArtistWithPublishedReleases };

// Release output types are now hand-written, Prisma-free domain types
// (drift-checked in release-repository). Imported above for local use,
// re-exported for back-compat with existing importers of `@/lib/types/media-models`.
export type {
  PublishedReleaseDetail,
  PublishedReleaseListing,
  Release,
  ReleaseCarouselItem,
  ReleaseListItem,
};

// =============================================================================
// Model Interfaces (matching Prisma schema models)
// =============================================================================

/**
 * Image model - matches Prisma Image model
 */
export interface Image {
  id: string;
  caption?: string;
  artist: Artist;
  artistId: string;
  release?: Release;
  releaseId?: string;
  url?: Url;
  urlId?: string;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Genre model - matches Prisma Genre model
 */
export interface Genre {
  id: string;
  name: string;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Label model - matches Prisma Label model
 */
export interface Label {
  id: string;
  name: string;
  signedOn?: Date;
  createdAt: Date;
  updatedAt: Date;
  artistLabels: ArtistLabel[];
}

/**
 * ArtistMember model - matches Prisma ArtistMember model
 */
export interface ArtistMember {
  id: string;
  artist: Artist;
  artistId: string;
  member: Artist;
  memberId: string;
}

/**
 * ArtistLabel model - matches Prisma ArtistLabel model
 */
export interface ArtistLabel {
  id: string;
  artist: Artist;
  artistId: string;
  label: Label;
  labelId: string;
}

/**
 * ArtistRelease model - matches Prisma ArtistRelease model
 */
export interface ArtistRelease {
  id: string;
  artist: Artist;
  artistId: string;
  release: Release;
  releaseId: string;
}

/**
 * ArtistUrl model - matches Prisma ArtistUrl model
 */
export interface ArtistUrl {
  id: string;
  artist: Artist;
  artistId: string;
  platform: Platform;
  url: string;
}

/**
 * Tag model - matches Prisma Tag model
 */
export interface Tag {
  id: string;
  name: string;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Variants model - matches Prisma Variants model
 */
export interface Variants {
  id: string;
  description: string;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Instrument model - matches Prisma Instrument model
 */
export interface Instrument {
  id: string;
  name: string;
  createdAt: Date;
  updatedAt: Date;
}

export type FeaturedArtist = Prisma.FeaturedArtistGetPayload<{
  include: {
    artists: {
      select: {
        id: true;
        displayName: true;
        firstName: true;
        surname: true;
        slug: true;
        images: { select: { src: true } };
      };
    };
    digitalFormat: {
      include: {
        files: true;
      };
    };
    release: {
      select: {
        id: true;
        title: true;
        coverArt: true;
        images: { select: { src: true } };
      };
    };
  };
}>;

/**
 * A single file within a digital format, used for playback in the
 * featured artists player.
 */
export type FeaturedArtistFormatFile = NonNullable<
  FeaturedArtist['digitalFormat']
>['files'][number];

// `Artist` is re-exported from the domain layer at the top of this file.

export type User = Prisma.UserGetPayload<{
  include: {
    accounts: true;
    sessions: true;
  };
}>;

export type Url = Prisma.UrlGetPayload<{
  include: {
    artist: true;
    release: true;
  };
}>;

export type ReleaseUrl = Prisma.ReleaseUrlGetPayload<{
  include: {
    release: true;
    url: true;
  };
}>;

// `ArtistListWithBio` and `ArtistWithPublishedReleases` are re-exported from the
// domain layer at the top of this file; their query includes live in
// artist-repository (drift-checked against the domain types). The public release
// listing/detail/carousel types are re-exported from the domain layer near the
// top of this file; their query includes/selects live in release-repository
// (drift-checked against the domain types).
