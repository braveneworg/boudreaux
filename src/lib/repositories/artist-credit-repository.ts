/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import 'server-only';

import { prisma } from '@/lib/prisma';
import {
  toCreditAwaitingConfirmation,
  toCreditThatStaysHidden,
  type CreditAwaitingConfirmation,
  type CreditThatStaysHidden,
  type PublishedWorkCreditedTo,
} from '@/lib/utils/credit-confirmation';

import {
  awaitingConfirmationAmongWhere,
  creditAwaitingConfirmationWhere,
  creditConfirmationSelect,
  creditThatStaysHiddenWhere,
  hiddenCreditSelect,
  staysHiddenAmongWhere,
} from './_internal/artist-where';
import { runQuery } from './_internal/map-prisma-error';
import { releaseWhere } from './_internal/release-where';

import type { Prisma } from '@prisma/client';

/** What {@link ArtistCreditRepository.publishCredited} needs to publish credits. */
export interface PublishCreditedInput {
  releaseId: string;
  /** The artists the admin confirmed. */
  artistIds: string[];
  /** The admin who confirmed them. */
  publishedBy: string;
  now: Date;
}

const byName = (a: { name: string }, b: { name: string }): number =>
  a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });

const readAwaitingConfirmation = async (
  where: Prisma.ArtistWhereInput
): Promise<CreditAwaitingConfirmation[]> => {
  const rows = await prisma.artist.findMany({ where, select: creditConfirmationSelect });
  return rows.map(toCreditAwaitingConfirmation).sort(byName);
};

const readThatStayHidden = async (
  where: Prisma.ArtistWhereInput
): Promise<CreditThatStaysHidden[]> => {
  const rows = await prisma.artist.findMany({ where, select: hiddenCreditSelect });
  return rows.map(toCreditThatStaysHidden).sort(byName);
};

/**
 * Reads and writes for a release's credited artists as publication sees them
 * (ADR-0015): which credits await an admin's confirmation, which stay hidden
 * whatever is confirmed, and the write that publishes the confirmed ones.
 */
export class ArtistCreditRepository {
  /**
   * Of the given artists, those that publishing would make public. For a
   * write whose credits are not stored yet.
   */
  static async findAwaitingConfirmationAmong(
    artistIds: string[]
  ): Promise<CreditAwaitingConfirmation[]> {
    return artistIds.length === 0
      ? []
      : readAwaitingConfirmation(awaitingConfirmationAmongWhere(artistIds));
  }

  /** Of the given artists, those that stay hidden even when published. */
  static async findThatStayHiddenAmong(artistIds: string[]): Promise<CreditThatStaysHidden[]> {
    return artistIds.length === 0 ? [] : readThatStayHidden(staysHiddenAmongWhere(artistIds));
  }

  /**
   * The artists credited on a release that publishing would make public,
   * each described by what would go live. The bio text itself is read only to
   * classify it and never leaves the repository.
   */
  static async findAwaitingConfirmation(releaseId: string): Promise<CreditAwaitingConfirmation[]> {
    return readAwaitingConfirmation(creditAwaitingConfirmationWhere({ releaseId }));
  }

  /**
   * The artists credited on a release that stay hidden even when published:
   * soft-deleted.
   */
  static async findThatStayHidden(releaseId: string): Promise<CreditThatStaysHidden[]> {
    return readThatStayHidden(creditThatStaysHiddenWhere({ releaseId }));
  }

  /**
   * Publish the confirmed artists credited on a release. The `where` repeats
   * the awaiting-confirmation gate, so an id that is not credited on the
   * release, is already published, or stays hidden is left untouched.
   *
   * @returns The number of artists published.
   */
  static async publishCredited({
    releaseId,
    artistIds,
    publishedBy,
    now,
  }: PublishCreditedInput): Promise<number> {
    if (artistIds.length === 0) {
      return 0;
    }
    const { count } = await prisma.artist.updateMany({
      where: { id: { in: artistIds }, ...creditAwaitingConfirmationWhere({ releaseId }) },
      data: { publishedOn: now, publishedBy },
    });
    return count;
  }

  /**
   * Credit the given artists on a new release, in the given order: the
   * array index is the stored credit position, so the first id is the album
   * artist.
   */
  static async addCredits(releaseId: string, artistIds: string[]): Promise<void> {
    if (artistIds.length === 0) {
      return;
    }
    await prisma.artistRelease.createMany({
      data: artistIds.map((artistId, position) => ({ artistId, releaseId, position })),
    });
  }

  /**
   * Credit one artist on an existing release, after every credit it already
   * has, so the stored order stays dense and the album artist (position 0)
   * is untouched; a repeat is a no-op. The metadata-driven find-or-create
   * path credits one artist at a time this way — through here, not through
   * an upsert of its own, so no writer stores a credit without a position.
   */
  static async creditOnRelease(releaseId: string, artistId: string): Promise<void> {
    const existing = await prisma.artistRelease.findUnique({
      where: { artistId_releaseId: { artistId, releaseId } },
      select: { id: true },
    });
    if (existing) {
      return;
    }
    const position = await prisma.artistRelease.count({ where: { releaseId } });
    await runQuery(() => prisma.artistRelease.create({ data: { artistId, releaseId, position } }));
  }

  /**
   * Make a release's credits match `artistIds` in that order: drop credits
   * for artists no longer listed, and upsert every listed artist with its
   * index as position — so moving an artist to the front makes it the album
   * artist, which the old insert-missing-only sync could not do (the ADR-0006
   * trade-off, now closed). One transaction, so a reader never sees a
   * half-renumbered release.
   */
  static async syncCredits(releaseId: string, artistIds: string[]): Promise<void> {
    const existing = await prisma.artistRelease.findMany({
      where: { releaseId },
      select: { id: true, artistId: true },
    });
    const wantedArtistIds = new Set(artistIds);
    const toDelete = existing.filter(({ artistId }) => !wantedArtistIds.has(artistId));

    await runQuery(() =>
      prisma.$transaction([
        ...(toDelete.length > 0
          ? [
              prisma.artistRelease.deleteMany({
                where: { id: { in: toDelete.map(({ id }) => id) } },
              }),
            ]
          : []),
        ...artistIds.map((artistId, position) =>
          prisma.artistRelease.upsert({
            where: { artistId_releaseId: { artistId, releaseId } },
            create: { artistId, releaseId, position },
            update: { position },
          })
        ),
      ])
    );
  }

  /**
   * The public work that carries an artist's name: the listed releases the
   * artist is credited on and the tour dates the artist headlines. Hiding the
   * artist removes the name from all of it.
   */
  static async findPublishedWorkCreditedTo(artistId: string): Promise<PublishedWorkCreditedTo> {
    const [credits, headliners] = await Promise.all([
      prisma.artistRelease.findMany({
        where: { artistId, release: releaseWhere.listed },
        select: { release: { select: { id: true, title: true } } },
      }),
      prisma.tourDateHeadliner.findMany({
        where: { artistId },
        select: {
          tourDate: {
            select: { id: true, startDate: true, tour: { select: { id: true, title: true } } },
          },
        },
      }),
    ]);
    return {
      releases: credits.map(({ release }) => release),
      tourDates: headliners.map(({ tourDate: { id, startDate, tour } }) => ({
        id,
        startDate,
        tourId: tour.id,
        tourTitle: tour.title,
      })),
    };
  }
}
