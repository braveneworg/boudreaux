/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import 'server-only';

import { prisma } from '@/lib/prisma';
import {
  toCreditThatStaysHidden,
  type CreditAwaitingConfirmation,
  type CreditThatStaysHidden,
  type PublishedWorkCreditedTo,
} from '@/lib/utils/credit-confirmation';

import {
  awaitingConfirmationAmongWhere,
  creditAwaitingConfirmationWhere,
  creditThatStaysHiddenWhere,
  hiddenCreditSelect,
  staysHiddenAmongWhere,
} from './_internal/artist-where';
import { orderedCredits } from './_internal/credit-order';
import { runQuery } from './_internal/map-prisma-error';
import { byDisplayedName, readAwaitingConfirmation } from './_internal/release-credits';
import { releaseWhere } from './_internal/release-where';

import type { Prisma } from '@prisma/client';

const readThatStayHidden = async (
  where: Prisma.ArtistWhereInput
): Promise<CreditThatStaysHidden[]> => {
  const rows = await prisma.artist.findMany({ where, select: hiddenCreditSelect });
  return rows.map(toCreditThatStaysHidden).sort(byDisplayedName);
};

/**
 * Reads for a release's credited artists as publication sees them (ADR-0015):
 * which credits await an admin's confirmation and which stay hidden whatever
 * is confirmed. A release write stores its credits and publishes the confirmed
 * artists in its own transaction (`ReleaseRepository`).
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
      : readAwaitingConfirmation(prisma, awaitingConfirmationAmongWhere(artistIds));
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
    return readAwaitingConfirmation(prisma, creditAwaitingConfirmationWhere({ releaseId }));
  }

  /**
   * The artists credited on a release that stay hidden even when published:
   * soft-deleted.
   */
  static async findThatStayHidden(releaseId: string): Promise<CreditThatStaysHidden[]> {
    return readThatStayHidden(creditThatStaysHiddenWhere({ releaseId }));
  }

  /**
   * The releases an artist is the album artist of: those whose first credit
   * in stored order is the artist (ADR-0015). Every release, draft or
   * published, since a draft's byline goes public with it.
   */
  static async findReleasesLedBy(artistId: string): Promise<Array<{ id: string; title: string }>> {
    const credits = await prisma.artistRelease.findMany({
      where: { artistId },
      select: {
        release: {
          select: {
            id: true,
            title: true,
            artistReleases: orderedCredits({ take: 1, select: { artistId: true } }),
          },
        },
      },
    });
    return credits
      .map(({ release }) => release)
      .filter((release) => release.artistReleases.at(0)?.artistId === artistId)
      .map(({ id, title }) => ({ id, title }));
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
   * The public work that carries an artist's name: the listed releases the
   * artist is credited on and the tour dates the artist headlines. Hiding the
   * artist removes the name from all of it, and leaves each release whose
   * first credit it is (its album artist) with no byline.
   */
  static async findPublishedWorkCreditedTo(artistId: string): Promise<PublishedWorkCreditedTo> {
    const [credits, headliners] = await Promise.all([
      prisma.artistRelease.findMany({
        where: { artistId, release: releaseWhere.listed },
        select: {
          release: {
            select: {
              id: true,
              title: true,
              artistReleases: orderedCredits({ take: 1, select: { artistId: true } }),
            },
          },
        },
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
      releases: credits.map(({ release: { id, title, artistReleases } }) => ({
        id,
        title,
        leavesNoByline: artistReleases.at(0)?.artistId === artistId,
      })),
      tourDates: headliners.map(({ tourDate: { id, startDate, tour } }) => ({
        id,
        startDate,
        tourId: tour.id,
        tourTitle: tour.title,
      })),
    };
  }
}
