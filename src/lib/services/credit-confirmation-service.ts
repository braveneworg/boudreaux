/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import 'server-only';

import { ArtistCreditRepository } from '@/lib/repositories/artist-credit-repository';
import {
  checkCreditDecisions,
  type CreditAwaitingConfirmation,
  type CreditConfirmation,
  type CreditDecisions,
  type PublishedWorkCreditedTo,
} from '@/lib/utils/credit-confirmation';
import { invalidatePublicNameCaches } from '@/lib/utils/public-name-caches';

import { failFromError } from './_internal/map-data-error';

import type { ServiceResponse } from './service.types';

/**
 * Whose credits a check reads: a release's stored credits, or the artists a
 * write is about to credit (a release form whose credits are not stored yet).
 */
export type CreditSource = { releaseId: string } | { artistIds: string[] };

/** What {@link CreditConfirmationService.publishConfirmed} needs. */
export interface PublishConfirmedInput {
  releaseId: string;
  decisions: CreditDecisions;
  /** The admin who made the decisions. */
  publishedBy: string;
}

const readAwaiting = (source: CreditSource): Promise<CreditAwaitingConfirmation[]> =>
  'releaseId' in source
    ? ArtistCreditRepository.findAwaitingConfirmation(source.releaseId)
    : ArtistCreditRepository.findAwaitingConfirmationAmong(source.artistIds);

const UNKNOWN_READ = { UNKNOWN: 'Failed to read the release credits' };

/**
 * The rule that a release publishes its credited artists only by
 * confirmation (ADR-0015). Every write that publishes a release, or credits an
 * artist on a published one, goes through {@link check} before it writes and
 * {@link publishConfirmed} after its credits are stored.
 */
export class CreditConfirmationService {
  /** A release's credits awaiting confirmation and those that stay hidden. */
  static async forRelease(releaseId: string): Promise<ServiceResponse<CreditConfirmation>> {
    try {
      const [awaiting, stayHidden] = await Promise.all([
        ArtistCreditRepository.findAwaitingConfirmation(releaseId),
        ArtistCreditRepository.findThatStayHidden(releaseId),
      ]);
      return { success: true, data: { awaiting, stayHidden } };
    } catch (error) {
      return failFromError(error, UNKNOWN_READ);
    }
  }

  /** The same two lists for the artists a release is about to credit. */
  static async forArtists(artistIds: string[]): Promise<ServiceResponse<CreditConfirmation>> {
    try {
      const [awaiting, stayHidden] = await Promise.all([
        ArtistCreditRepository.findAwaitingConfirmationAmong(artistIds),
        ArtistCreditRepository.findThatStayHiddenAmong(artistIds),
      ]);
      return { success: true, data: { awaiting, stayHidden } };
    } catch (error) {
      return failFromError(error, UNKNOWN_READ);
    }
  }

  /**
   * Check that every credit awaiting confirmation has a decision. Fails with
   * `VALIDATION`, naming the artists, when one does not. Writes nothing.
   */
  static async check(
    source: CreditSource,
    decisions: CreditDecisions
  ): Promise<ServiceResponse<void>> {
    try {
      const outcome = checkCreditDecisions(await readAwaiting(source), decisions);
      return outcome.ok
        ? { success: true, data: undefined }
        : { success: false, code: 'VALIDATION', error: outcome.error };
    } catch (error) {
      return failFromError(error, UNKNOWN_READ);
    }
  }

  /**
   * Publish the artists the admin chose to publish, once the release's credits
   * are stored. Checks the decisions against the stored credits first, so a
   * credit added since the admin decided stops the write.
   *
   * @returns The number of artists published.
   */
  static async publishConfirmed({
    releaseId,
    decisions,
    publishedBy,
  }: PublishConfirmedInput): Promise<ServiceResponse<number>> {
    const checked = await CreditConfirmationService.check({ releaseId }, decisions);
    if (!checked.success) {
      return checked;
    }
    if (decisions.publishArtistIds.length === 0) {
      return { success: true, data: 0 };
    }
    try {
      const count = await ArtistCreditRepository.publishCredited({
        releaseId,
        artistIds: decisions.publishArtistIds,
        publishedBy,
        now: new Date(),
      });
      invalidatePublicNameCaches();
      return { success: true, data: count };
    } catch (error) {
      return failFromError(error, { UNKNOWN: 'Failed to publish the credited artists' });
    }
  }

  /** The public work that carries an artist's name, listed before hiding the artist. */
  static async publishedWorkCreditedTo(
    artistId: string
  ): Promise<ServiceResponse<PublishedWorkCreditedTo>> {
    try {
      return {
        success: true,
        data: await ArtistCreditRepository.findPublishedWorkCreditedTo(artistId),
      };
    } catch (error) {
      return failFromError(error, { UNKNOWN: "Failed to read the artist's published work" });
    }
  }
}
