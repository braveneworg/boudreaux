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
   * Credit the given artists on a release, in the given order. Credit order is
   * insertion order (ADR-0006), so the caller's array order is the credit order.
   */
  static async addCredits(releaseId: string, artistIds: string[]): Promise<void> {
    if (artistIds.length === 0) {
      return;
    }
    await prisma.artistRelease.createMany({
      data: artistIds.map((artistId) => ({ artistId, releaseId })),
    });
  }

  /**
   * Make a release's credits match `artistIds`: drop credits for artists no
   * longer listed and add credits for artists not yet credited. Existing rows
   * are kept, so re-ordering the list does not re-order existing credits
   * (the ADR-0006 trade-off).
   */
  static async syncCredits(releaseId: string, artistIds: string[]): Promise<void> {
    const existing = await prisma.artistRelease.findMany({
      where: { releaseId },
      select: { id: true, artistId: true },
    });

    const existingArtistIds = new Set(existing.map(({ artistId }) => artistId));
    const wantedArtistIds = new Set(artistIds);

    const toDelete = existing.filter(({ artistId }) => !wantedArtistIds.has(artistId));
    const toCreate = artistIds.filter((artistId) => !existingArtistIds.has(artistId));

    const ops: Promise<unknown>[] = [];
    if (toDelete.length > 0) {
      ops.push(
        prisma.artistRelease.deleteMany({ where: { id: { in: toDelete.map(({ id }) => id) } } })
      );
    }
    if (toCreate.length > 0) {
      ops.push(
        prisma.artistRelease.createMany({
          data: toCreate.map((artistId) => ({ artistId, releaseId })),
        })
      );
    }
    await Promise.all(ops);
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
