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
  creditAwaitingConfirmationWhere,
  creditConfirmationSelect,
  creditThatStaysHiddenWhere,
  hiddenCreditSelect,
  listedReleaseWhere,
} from './_internal/artist-where';
import { runQuery } from './_internal/map-prisma-error';

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

/**
 * Reads and writes for a release's credited artists as publication sees them
 * (ADR-0015): which credits await an admin's confirmation, which stay hidden
 * whatever is confirmed, and the write that publishes the confirmed ones.
 */
export class ArtistCreditRepository {
  /**
   * The artists credited on a release that publishing would make public,
   * each described by what would go live. The bio text itself is read only to
   * classify it and never leaves the repository.
   */
  static async findAwaitingConfirmation(releaseId: string): Promise<CreditAwaitingConfirmation[]> {
    const rows = await runQuery(() =>
      prisma.artist.findMany({
        where: creditAwaitingConfirmationWhere({ releaseId }),
        select: creditConfirmationSelect,
      })
    );
    return rows.map(toCreditAwaitingConfirmation).sort(byName);
  }

  /**
   * The artists credited on a release that stay hidden even when published:
   * soft-deleted, or inactive with no departure date.
   */
  static async findThatStayHidden(releaseId: string): Promise<CreditThatStaysHidden[]> {
    const rows = await runQuery(() =>
      prisma.artist.findMany({
        where: creditThatStaysHiddenWhere({ releaseId }),
        select: hiddenCreditSelect,
      })
    );
    return rows.map(toCreditThatStaysHidden).sort(byName);
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
    const { count } = await runQuery(() =>
      prisma.artist.updateMany({
        where: { id: { in: artistIds }, ...creditAwaitingConfirmationWhere({ releaseId }) },
        data: { publishedOn: now, publishedBy },
      })
    );
    return count;
  }

  /**
   * The public work that carries an artist's name: the listed releases the
   * artist is credited on and the tour dates the artist headlines. Hiding the
   * artist removes the name from all of it.
   */
  static async findPublishedWorkCreditedTo(artistId: string): Promise<PublishedWorkCreditedTo> {
    const [credits, headliners] = await Promise.all([
      runQuery(() =>
        prisma.artistRelease.findMany({
          where: { artistId, release: listedReleaseWhere },
          select: { release: { select: { id: true, title: true } } },
        })
      ),
      runQuery(() =>
        prisma.tourDateHeadliner.findMany({
          where: { artistId },
          select: {
            tourDate: {
              select: { id: true, startDate: true, tour: { select: { id: true, title: true } } },
            },
          },
        })
      ),
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
