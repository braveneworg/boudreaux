/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import 'server-only';

import { prisma } from '@/lib/prisma';
import type { ArtistBioLinkRecord, CreateArtistBioLinkData } from '@/lib/types/domain/artist';

import { runQuery } from './_internal/map-prisma-error';

import type { Prisma } from '@prisma/client';

/**
 * Prisma filter selecting rows that play the bio *reference* role. Legacy
 * documents predate the `reference` field, so `null` and absent (`isSet: false`
 * — a Mongo-only quirk: `{ reference: null }` does not match a missing field)
 * both read as reference links; only an explicit `false` (an image-source-only
 * row) is excluded.
 */
export const referenceLinkWhere: Prisma.ArtistBioLinkWhereInput = {
  OR: [{ reference: true }, { reference: null }, { reference: { isSet: false } }],
};

/**
 * Data access for `ArtistBioLink` rows — the reference links discovered during
 * AI bio generation or authored by an admin. A child collection of the `Artist`
 * aggregate; the atomic generate-time replace (`ArtistRepository.replaceBioContent`)
 * still writes these rows inside its own transaction, so this repository owns
 * the standalone (à-la-carte) link operations.
 */
export class ArtistBioLinkRepository {
  /** Creates a single bio link row (admin-authored custom link), appending it
   *  after the artist's current highest `sortOrder`. */
  static async create(data: CreateArtistBioLinkData): Promise<ArtistBioLinkRecord> {
    return runQuery(async () => {
      const { _max } = await prisma.artistBioLink.aggregate({
        where: { artistId: data.artistId },
        _max: { sortOrder: true },
      });
      const sortOrder = (_max.sortOrder ?? -1) + 1;
      return prisma.artistBioLink.create({
        data: {
          artistId: data.artistId,
          label: data.label,
          url: data.url,
          kind: data.kind,
          // The admin-authored path only ever creates custom rows, so a
          // regeneration preserves them (see `replaceBioContent`).
          origin: data.origin ?? 'custom',
          sortOrder,
          reference: data.reference ?? true,
          imageSource: data.imageSource ?? false,
        },
      });
    }) as Promise<ArtistBioLinkRecord>;
  }

  /** Deletes a single discovered bio link row (palette X). */
  static async delete(linkId: string): Promise<void> {
    await prisma.artistBioLink.delete({ where: { id: linkId } });
  }

  /** Lists the artist's image-source links (rows flagged `imageSource`) in
   *  sort order — the pages the images-from-links job reads for photos. */
  static async findImageSources(artistId: string): Promise<ArtistBioLinkRecord[]> {
    return runQuery(() =>
      prisma.artistBioLink.findMany({
        where: { artistId, imageSource: true },
        orderBy: { sortOrder: 'asc' },
      })
    ) as Promise<ArtistBioLinkRecord[]>;
  }

  /**
   * Flags a URL as an image source for the artist. The `(artistId, url)` index
   * allows one row per URL, so a URL already stored as a reference link gets
   * its `imageSource` flag set (keeping its reference role) rather than a
   * second row; a new URL becomes an image-only custom row (`reference: false`)
   * so it stays out of the palette, the bio payload and the public links.
   */
  static async upsertImageSource(
    artistId: string,
    url: string,
    label: string
  ): Promise<ArtistBioLinkRecord> {
    return runQuery(async () => {
      const existing = await prisma.artistBioLink.findFirst({ where: { artistId, url } });
      if (existing) {
        if (existing.imageSource) return existing;
        return prisma.artistBioLink.update({
          where: { id: existing.id },
          data: { imageSource: true },
        });
      }
      const { _max } = await prisma.artistBioLink.aggregate({
        where: { artistId },
        _max: { sortOrder: true },
      });
      return prisma.artistBioLink.create({
        data: {
          artistId,
          label,
          url,
          kind: 'other',
          origin: 'custom',
          sortOrder: (_max.sortOrder ?? -1) + 1,
          reference: false,
          imageSource: true,
        },
      });
    }) as Promise<ArtistBioLinkRecord>;
  }

  /**
   * Drops the image-source role from one of the artist's links. A row that is
   * image-source only is deleted; a row that also plays the reference role
   * merely loses the flag. Returns `false` when no such image-source row
   * belongs to the artist (a foreign or stale id is a no-op, never an error).
   */
  static async removeImageSource(artistId: string, linkId: string): Promise<boolean> {
    return runQuery(async () => {
      const row = await prisma.artistBioLink.findFirst({
        where: { id: linkId, artistId, imageSource: true },
      });
      if (!row) return false;
      if (row.reference === false) {
        await prisma.artistBioLink.delete({ where: { id: linkId } });
      } else {
        await prisma.artistBioLink.update({ where: { id: linkId }, data: { imageSource: false } });
      }
      return true;
    });
  }

  /** Finds one bio link row for an artist by exact URL, or null when none.
   *  Used to dedupe the admin add-link path so the same URL is never stored
   *  twice (whether it was previously added as custom or discovered). */
  static async findByUrl(artistId: string, url: string): Promise<ArtistBioLinkRecord | null> {
    return runQuery(() =>
      prisma.artistBioLink.findFirst({ where: { artistId, url } })
    ) as Promise<ArtistBioLinkRecord | null>;
  }
}
