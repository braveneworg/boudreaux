/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import 'server-only';

import { prisma } from '@/lib/prisma';
import type { ArtistBioLinkRecord, CreateArtistBioLinkData } from '@/lib/types/domain/artist';

import { runQuery } from './_internal/map-prisma-error';

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
        },
      });
    }) as Promise<ArtistBioLinkRecord>;
  }

  /** Deletes a single discovered bio link row (palette X). */
  static async delete(linkId: string): Promise<void> {
    await prisma.artistBioLink.delete({ where: { id: linkId } });
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
