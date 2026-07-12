/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Hand-written, Prisma-free mirror of the `VideoArtist` join model (a video's
 * link to the Artist catalog, parsed from the free-text artist string).
 */

/** Role union mirroring the Prisma `VideoArtistRole` enum. */
export type VideoArtistRole = 'PRIMARY' | 'FEATURED';

/** Scalar fields of the Prisma `VideoArtist` join model (no relations). */
export interface VideoArtistRecord {
  id: string;
  videoId: string;
  artistId: string;
  role: VideoArtistRole;
  sortOrder: number;
}
