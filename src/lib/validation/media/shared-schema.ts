/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { z } from 'zod';

import type { ArtistScalars } from '@/lib/types/domain/artist';
import type { Format, Platform } from '@/lib/types/media-models';
import { FORMATS } from '@/lib/types/media-models';
import { jsonValueSchema } from '@/lib/validation/json-schema';

/**
 * Shared leaf shapes and scalar bases for the media wire schemas, split from the
 * former `media-models-schema` module so each entity module (artist, release,
 * featured-artist, digital-format) composes these without pulling in the others.
 *
 * Two wire-format facts are handled here so runtime values match the
 * Prisma-derived TypeScript types:
 * - `DateTime` fields arrive as ISO strings → `z.coerce.date()` rebuilds `Date`.
 * - `BigInt` fields are serialized to `number` → `z.coerce.bigint()` restores `bigint`.
 *
 * `artistScalarSchema` and `releaseScalarSchema` live here together — not in
 * their entity modules — because the artist and release relation schemas each
 * embed the other's scalar, so co-locating the two bases keeps the entity
 * modules a clean dependency chain (release → shared, artist → release) instead
 * of a circular import that would break zod's eager schema construction.
 */

/** Wire-coercion primitive: an ISO string rebuilt into a `Date`. */
export const date = z.coerce.date();
/** Wire-coercion primitive: a nullable ISO string rebuilt into `Date | null`. */
export const nullableDate = z.coerce.date().nullable();
/** Nullable string leaf, reused across every media wire shape. */
export const nullableString = z.string().nullable();

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
export const imageSchema = z.object({
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
export const urlSchema = z.object({
  id: z.string(),
  artistId: nullableString,
  releaseId: nullableString,
  platform: platformSchema,
  url: z.string(),
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
  bioStatus: nullableString,
  bioError: nullableString,
  bioStartedAt: nullableDate,
  bioJobToken: nullableString,
  bioProgress: jsonValueSchema,
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
}) satisfies z.ZodType<ArtistScalars>;

/** All scalar fields of the `Release` model (no relations included). */
export const releaseScalarSchema = z.object({
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
