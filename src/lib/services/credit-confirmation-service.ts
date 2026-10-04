/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import 'server-only';

import { ArtistCreditRepository } from '@/lib/repositories/artist-credit-repository';
import {
  checkCreditDecisions,
  type CreditConfirmation,
  type CreditDecisions,
  type PublishedWorkCreditedTo,
} from '@/lib/utils/credit-confirmation';

import { failFromError } from './_internal/map-data-error';

import type { ServiceResponse } from './service.types';

const UNKNOWN_READ = { UNKNOWN: 'Failed to read the release credits' };

/**
 * The rule that a release publishes its credited artists only by
 * confirmation (ADR-0015): what a publish would make public, and a check a
 * write can make before it creates anything. The check that decides is the
 * one inside the release write's own transaction (`ReleaseService`), against
 * the credits it has just stored.
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
   * Check that every one of the given artists awaiting confirmation has a
   * decision, for a write whose credits are not stored yet. Fails with
   * `VALIDATION`, naming the artists, when one does not. Writes nothing.
   */
  static async check(
    artistIds: string[],
    decisions: CreditDecisions
  ): Promise<ServiceResponse<void>> {
    try {
      const awaiting = await ArtistCreditRepository.findAwaitingConfirmationAmong(artistIds);
      const outcome = checkCreditDecisions(awaiting, decisions);
      return outcome.ok
        ? { success: true, data: undefined }
        : { success: false, code: 'VALIDATION', error: outcome.error };
    } catch (error) {
      return failFromError(error, UNKNOWN_READ);
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
