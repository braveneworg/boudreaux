/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import type { prisma } from '@/lib/prisma';
import { CreditDecisionError } from '@/lib/types/domain/errors';
import {
  checkCreditDecisions,
  toCreditAwaitingConfirmation,
  type CreditAwaitingConfirmation,
  type CreditDecisions,
} from '@/lib/utils/credit-confirmation';

import { creditAwaitingConfirmationWhere, creditConfirmationSelect } from './artist-where';
import { creditOrderBy } from './credit-order';

import type { Prisma } from '@prisma/client';

/**
 * The client a credit write runs on: the release write's transaction. The
 * Prisma client is extended, so `Prisma.TransactionClient` does not accept the
 * `tx` it hands out; a `Pick` of the models used does.
 */
export type CreditClient = Pick<typeof prisma, 'artist' | 'artistRelease'>;

/** What publishing a release decides for its credits (ADR-0015). */
export interface CreditPublication {
  /** The admin's decision for each credit awaiting confirmation. */
  decisions: CreditDecisions;
  /** The admin who made the decisions. */
  publishedBy: string;
  /** When the release is published; the confirmed artists get the same time. */
  now: Date;
}

/** Orders described credits by displayed name, ignoring case and accents. */
export const byDisplayedName = (a: { name: string }, b: { name: string }): number =>
  a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });

/**
 * The artists matching `where` that publishing would make public, each
 * described by what would go live, in displayed-name order.
 */
export const readAwaitingConfirmation = async (
  client: Pick<CreditClient, 'artist'>,
  where: Prisma.ArtistWhereInput
): Promise<CreditAwaitingConfirmation[]> => {
  const rows = await client.artist.findMany({ where, select: creditConfirmationSelect });
  return rows.map(toCreditAwaitingConfirmation).sort(byDisplayedName);
};

/**
 * Credit the given artists on a new release, in the given order: the array
 * index is the stored credit position, so the first id is the album artist.
 */
export const addCredits = async (
  client: CreditClient,
  releaseId: string,
  artistIds: string[]
): Promise<void> => {
  if (artistIds.length === 0) {
    return;
  }
  await client.artistRelease.createMany({
    data: artistIds.map((artistId, position) => ({ artistId, releaseId, position })),
  });
};

/**
 * Make a release's credits match `artistIds` in that order: drop credits for
 * artists no longer listed, and upsert every listed artist with its index as
 * position — so moving an artist to the front makes it the album artist. The
 * writes run one after another: a MongoDB transaction takes no parallel
 * operations.
 */
export const syncCredits = async (
  client: CreditClient,
  releaseId: string,
  artistIds: string[]
): Promise<void> => {
  const existing = await client.artistRelease.findMany({
    where: { releaseId },
    select: { id: true, artistId: true },
  });
  const wanted = new Set(artistIds);
  const toDelete = existing.filter(({ artistId }) => !wanted.has(artistId));
  if (toDelete.length > 0) {
    await client.artistRelease.deleteMany({ where: { id: { in: toDelete.map(({ id }) => id) } } });
  }
  for (const [position, artistId] of artistIds.entries()) {
    await client.artistRelease.upsert({
      where: { artistId_releaseId: { artistId, releaseId } },
      create: { artistId, releaseId, position },
      update: { position },
    });
  }
};

/**
 * Re-stamp a release's credits 0..n-1 in their stored order, after a credit
 * was removed (a hard-deleted artist's). Writes only the rows whose position
 * moves, one after another: a MongoDB transaction takes no parallel
 * operations.
 */
export const renumberCredits = async (client: CreditClient, releaseId: string): Promise<void> => {
  const rows = await client.artistRelease.findMany({
    where: { releaseId },
    orderBy: creditOrderBy,
    select: { id: true, position: true },
  });
  for (const [position, row] of rows.entries()) {
    if (row.position !== position) {
      await client.artistRelease.update({ where: { id: row.id }, data: { position } });
    }
  }
};

/**
 * Check the admin's decisions against the credits the release stores, then
 * publish the artists the admin chose to publish. Runs after the credits are
 * written in the same transaction, so a credit the write adds is checked too.
 * A failed check throws a {@link CreditDecisionError}, which rolls the whole
 * write back. The `updateMany` repeats the awaiting-confirmation gate, so an
 * id that is not credited, is already public or stays hidden is left alone.
 *
 * @returns The number of artists published.
 */
export const publishConfirmedCredits = async (
  client: CreditClient,
  releaseId: string,
  { decisions, publishedBy, now }: CreditPublication
): Promise<number> => {
  const awaitingWhere = creditAwaitingConfirmationWhere({ releaseId });
  const outcome = checkCreditDecisions(
    await readAwaitingConfirmation(client, awaitingWhere),
    decisions
  );
  if (!outcome.ok) {
    throw new CreditDecisionError(outcome.error);
  }
  if (decisions.publishArtistIds.length === 0) {
    return 0;
  }
  const { count } = await client.artist.updateMany({
    where: { id: { in: decisions.publishArtistIds }, ...awaitingWhere },
    data: { publishedOn: now, publishedBy },
  });
  return count;
};
