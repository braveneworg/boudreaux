/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Vendor-neutral primitives shared across the hand-written domain types. These
 * mirror the corresponding Prisma schema enums/scalars but import nothing from
 * Prisma, so every layer above the repository can depend on them. Each is drift-
 * checked against its Prisma counterpart inside the repository layer.
 */

/** Social/streaming platforms — mirrors the Prisma `Platform` enum. */
export type Platform =
  | 'SPOTIFY'
  | 'APPLE_MUSIC'
  | 'BANDCAMP'
  | 'YOUTUBE'
  | 'SOUNDCLOUD'
  | 'AMAZON_MUSIC'
  | 'FACEBOOK'
  | 'TWITTER'
  | 'INSTAGRAM'
  | 'BLUESKY'
  | 'TIKTOK'
  | 'WEBSITE'
  | 'PATREON'
  | 'DISCOGS';

/** Release/format identifiers — mirrors the Prisma `Format` enum values. */
export const FORMATS = {
  // Use AI to expand this list as needed
  DIGITAL: 'DIGITAL',
  MP3_320KBPS: 'MP3_320KBPS',
  MP3_256KBPS: 'MP3_256KBPS',
  MP3_192KBPS: 'MP3_192KBPS',
  MP3_128KBPS: 'MP3_128KBPS',
  FLAC: 'FLAC',
  ALAC: 'ALAC',
  WAV: 'WAV',
  AIFF: 'AIFF',
  AAC: 'AAC',
  OGG_VORBIS: 'OGG_VORBIS',
  WMA: 'WMA',
  CD: 'CD',
  VINYL: 'VINYL',
  VINYL_7_INCH: 'VINYL_7_INCH',
  VINYL_10_INCH: 'VINYL_10_INCH',
  VINYL_12_INCH: 'VINYL_12_INCH',
  VINYL_180G: 'VINYL_180G',
  VINYL_COLORED: 'VINYL_COLORED',
  VINYL_PICTURE_DISC: 'VINYL_PICTURE_DISC',
  VINYL_GATEFOLD: 'VINYL_GATEFOLD',
  VINYL_SPLATTERED: 'VINYL_SPLATTERED',
  VINYL_ETCHED: 'VINYL_ETCHED',
  VINYL_45RPM: 'VINYL_45RPM',
  VINYL_33RPM: 'VINYL_33RPM',
  VINYL_TRANSPARENT: 'VINYL_TRANSPARENT',
  VINYL_DOUBLE_LP: 'VINYL_DOUBLE_LP',
  VINYL_TRIPLE_LP: 'VINYL_TRIPLE_LP',
  VINYL_QUAD_LP: 'VINYL_QUAD_LP',
  CASSETTE: 'CASSETTE',
  VIDEO: 'VIDEO',
  OTHER: 'OTHER',
} as const;

export type Format = (typeof FORMATS)[keyof typeof FORMATS];

/** JSON value type for extended-data fields — mirrors `Prisma.JsonValue`. */
export type Json = string | number | boolean | null | { [key: string]: Json } | Json[];
