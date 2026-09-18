/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import 'server-only';

import { prisma } from '@/lib/prisma';
import type { ArtistBioImageRecord, CreateArtistBioImageData } from '@/lib/types/domain/artist';

import { runQuery } from './_internal/map-prisma-error';

/** Bio image row projection used by the save-time full re-host pass. */
export interface BioImageRehostRow {
  id: string;
  url: string;
  thumbnailUrl: string | null;
  originalUrl: string | null;
}

/** The projection the display-image rules read before choosing rows. */
export interface BioImageEligibilityRow {
  id: string;
  alt: string | null;
  origin: string | null;
}

/**
 * Data access for `ArtistBioImage` rows — the images discovered during AI bio
 * generation or added by an admin. A child collection of the `Artist`
 * aggregate; the atomic generate-time replace (`ArtistRepository.replaceBioContent`)
 * still writes these rows inside its own transaction, so this repository owns
 * the standalone (à-la-carte) image operations.
 */
export class ArtistBioImageRepository {
  /** Creates a single bio image row (manual upload / curated addition),
   *  appending it after the artist's current highest `sortOrder`. */
  static async create(data: CreateArtistBioImageData): Promise<ArtistBioImageRecord> {
    const isPrimary = data.isPrimary ?? false;
    return runQuery(async () => {
      const { _max } = await prisma.artistBioImage.aggregate({
        where: { artistId: data.artistId },
        _max: { sortOrder: true },
      });
      const sortOrder = (_max.sortOrder ?? -1) + 1;
      return prisma.artistBioImage.create({
        data: {
          artistId: data.artistId,
          url: data.url,
          thumbnailUrl: data.thumbnailUrl,
          title: data.title,
          attribution: data.attribution,
          license: data.license,
          licenseUrl: data.licenseUrl,
          sourceUrl: data.sourceUrl,
          originalUrl: data.originalUrl,
          width: data.width,
          height: data.height,
          isPrimary,
          kind: data.kind,
          alt: data.alt,
          // The manual/RTE-upload path only ever creates custom rows, so a
          // regeneration preserves them (see `replaceBioContent`).
          origin: data.origin ?? 'custom',
          sortOrder,
        },
      });
    }) as Promise<ArtistBioImageRecord>;
  }

  /** Deletes a single discovered bio image row (palette X) and returns its
   *  stored URLs so the caller can clean up the CDN thumbnail. */
  static async delete(imageId: string): Promise<{ url: string; thumbnailUrl: string | null }> {
    const removed = await prisma.artistBioImage.delete({
      where: { id: imageId },
      select: { url: true, thumbnailUrl: true },
    });
    return removed;
  }

  /** Lists an artist's bio image rows with the URLs needed to decide whether a
   *  save-time full re-host is required (thumbnail → originalUrl upgrade). */
  static async findForRehost(artistId: string): Promise<BioImageRehostRow[]> {
    return runQuery(() =>
      prisma.artistBioImage.findMany({
        where: { artistId },
        select: { id: true, url: true, thumbnailUrl: true, originalUrl: true },
      })
    );
  }

  /** Lists an artist's admin-uploaded (`origin: 'custom'`) bio image URLs in
   *  sort order — used to seed the Lambda's face-matching reference images. */
  static async findCustomUrls(artistId: string): Promise<string[]> {
    const rows = await runQuery(() =>
      prisma.artistBioImage.findMany({
        where: { artistId, origin: 'custom' },
        orderBy: { sortOrder: 'asc' },
        select: { url: true },
      })
    );
    return rows.map(({ url }) => url);
  }

  /** Points a bio image row at its upgraded (fully re-hosted) CDN URL. */
  static async updateUrl(imageId: string, url: string): Promise<void> {
    await runQuery(() => prisma.artistBioImage.update({ where: { id: imageId }, data: { url } }));
  }

  /** Updates a single bio image row's attribution text (admin edit). */
  static async updateAttribution(imageId: string, attribution: string | null): Promise<void> {
    await runQuery(() =>
      prisma.artistBioImage.update({ where: { id: imageId }, data: { attribution } })
    );
  }

  /** Updates a single bio image row's alt text (admin edit). */
  static async updateAlt(imageId: string, alt: string | null): Promise<void> {
    await runQuery(() => prisma.artistBioImage.update({ where: { id: imageId }, data: { alt } }));
  }

  /** Lists an artist's full bio image rows in pool (`sortOrder`) order. */
  static async findManyByArtist(artistId: string): Promise<ArtistBioImageRecord[]> {
    return runQuery(() =>
      prisma.artistBioImage.findMany({ where: { artistId }, orderBy: { sortOrder: 'asc' } })
    ) as Promise<ArtistBioImageRecord[]>;
  }

  /**
   * Reads the eligibility projection of the given rows, scoped to the artist
   * so a row belonging to another artist is simply absent from the result.
   */
  static async findManyByIds(artistId: string, ids: string[]): Promise<BioImageEligibilityRow[]> {
    if (ids.length === 0) return [];
    return runQuery(() =>
      prisma.artistBioImage.findMany({
        where: { artistId, id: { in: ids } },
        select: { id: true, alt: true, origin: true },
      })
    );
  }

  /**
   * Replaces the artist's display images with `orderedIds` in one transaction:
   * every position for the artist is cleared, then each given row takes its
   * index as `displayOrder` and is promoted to `origin: 'custom'` so a bio
   * regeneration keeps it (`ArtistRepository.replaceBioContent` deletes only
   * non-custom rows). The `where` carries `artistId` so a foreign row id can
   * never be written. Callers validate the cap, uniqueness, ownership, and
   * alt-text eligibility before reaching here.
   */
  static async setDisplayOrder(artistId: string, orderedIds: string[]): Promise<void> {
    await runQuery(() =>
      prisma.$transaction(async (tx) => {
        await tx.artistBioImage.updateMany({ where: { artistId }, data: { displayOrder: null } });
        for (const [displayOrder, id] of orderedIds.entries()) {
          await tx.artistBioImage.update({
            where: { id, artistId },
            data: { displayOrder, origin: 'custom' },
          });
        }
      })
    );
  }
}
