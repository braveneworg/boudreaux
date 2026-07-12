/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import 'server-only';

import { prisma } from '@/lib/prisma';
import type { VideoArtistRole } from '@/lib/types/domain/video-artist';

import { runQuery } from './_internal/map-prisma-error';

/** Artist identity projection joined onto each VideoArtist row for enrichment. */
export interface VideoArtistWithArtist {
  artistId: string;
  role: VideoArtistRole;
  sortOrder: number;
  artist: {
    displayName: string | null;
    firstName: string;
    middleName: string | null;
    surname: string;
    akaNames: string | null;
    bornOn: Date | null;
  };
}

/** The artist columns enrichment compares suggestions against. */
const artistIdentitySelect = {
  displayName: true,
  firstName: true,
  middleName: true,
  surname: true,
  akaNames: true,
  bornOn: true,
} as const;

/**
 * Data-access layer for the `VideoArtist` join model. The only layer that
 * touches Prisma for video-artist links; every call is wrapped in `runQuery`
 * so callers see vendor-neutral `DataError`s.
 */
export class VideoArtistRepository {
  /**
   * Replace a video's artist links in one transaction: delete the existing
   * rows, then bulk-create the new batch (single `createMany` — never
   * concurrent `create`s, which race Prisma's read-back on fresh collections).
   */
  static async replaceForVideo(
    videoId: string,
    rows: ReadonlyArray<{ artistId: string; role: VideoArtistRole; sortOrder: number }>
  ): Promise<void> {
    await runQuery(() =>
      prisma.$transaction(async (tx) => {
        await tx.videoArtist.deleteMany({ where: { videoId } });
        if (rows.length > 0) {
          await tx.videoArtist.createMany({
            data: rows.map((row) => ({ ...row, videoId })),
          });
        }
      })
    );
  }

  /** List a video's artist links (sortOrder asc) with the identity projection. */
  static async findByVideoId(videoId: string): Promise<VideoArtistWithArtist[]> {
    return runQuery(() =>
      prisma.videoArtist.findMany({
        where: { videoId },
        orderBy: { sortOrder: 'asc' },
        select: {
          artistId: true,
          role: true,
          sortOrder: true,
          artist: { select: artistIdentitySelect },
        },
      })
    );
  }

  /** Delete every artist link for a video (video hard-delete cleanup). */
  static async deleteByVideoId(videoId: string): Promise<void> {
    await runQuery(() => prisma.videoArtist.deleteMany({ where: { videoId } }));
  }
}
