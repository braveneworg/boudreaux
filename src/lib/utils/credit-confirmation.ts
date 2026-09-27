/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Credit confirmation — what an admin is shown before a release's credited
 * artists are published with it (ADR-0015).
 *
 * A credit is **awaiting confirmation** when stamping `publishedOn` would make
 * its artist public: no `publishedOn`, current or alumni, not deleted. A
 * credit **stays hidden** when publishing cannot make it public, because the
 * artist is soft-deleted or inactive with no departure date.
 *
 * Pure and client-safe: the repository, the confirmation dialog and the
 * backfill script all describe a credit through here.
 */

import { resolveDisplayImages, type DisplayImageCandidate } from './display-images';
import { getArtistDisplayName, type ArtistNameFields } from './get-artist-display-name';

/** What kind of bio goes public with an artist. */
export type CreditBioState = 'none' | 'hand-written' | 'generated';

/** Why publishing an artist would still leave it hidden. */
export type HiddenCreditReason = 'deleted' | 'no-departure-date';

/** The fields read off an artist whose credit awaits confirmation. */
export interface CreditConfirmationRow extends ArtistNameFields {
  id: string;
  slug: string;
  bio: string | null;
  shortBio: string | null;
  altBio: string | null;
  bioGeneratedAt: Date | null;
  bioImages: DisplayImageCandidate[];
}

/** The fields read off an artist whose credit stays hidden. */
export interface HiddenCreditRow extends ArtistNameFields {
  id: string;
  slug: string;
  isActive: boolean;
  deactivatedAt: Date | null;
  deletedOn: Date | null;
}

/** A credited artist the admin may confirm, with what would go live. */
export interface CreditAwaitingConfirmation {
  id: string;
  slug: string;
  name: string;
  bioState: CreditBioState;
  /** When the bio was generated; `null` unless `bioState` is `'generated'`. */
  bioGeneratedAt: Date | null;
  displayImageCount: number;
}

/** A credited artist that publishing cannot make public, with the reason. */
export interface CreditThatStaysHidden {
  id: string;
  slug: string;
  name: string;
  reason: HiddenCreditReason;
}

/** The public work that carries an artist's name, listed before hiding it. */
export interface PublishedWorkCreditedTo {
  releases: Array<{ id: string; title: string }>;
  tourDates: Array<{ id: string; startDate: Date; tourId: string; tourTitle: string }>;
}

const hasText = (value: string | null): boolean => Boolean(value?.trim());

const bioStateOf = ({
  bio,
  shortBio,
  altBio,
  bioGeneratedAt,
}: Pick<
  CreditConfirmationRow,
  'bio' | 'shortBio' | 'altBio' | 'bioGeneratedAt'
>): CreditBioState => {
  if (![bio, shortBio, altBio].some(hasText)) {
    return 'none';
  }
  return bioGeneratedAt ? 'generated' : 'hand-written';
};

/**
 * Describe a credit awaiting confirmation: the artist's displayed name and
 * what publishing it would put on the public artist page.
 */
export const toCreditAwaitingConfirmation = (
  row: CreditConfirmationRow
): CreditAwaitingConfirmation => {
  const bioState = bioStateOf(row);
  return {
    id: row.id,
    slug: row.slug,
    name: getArtistDisplayName(row),
    bioState,
    bioGeneratedAt: bioState === 'generated' ? row.bioGeneratedAt : null,
    displayImageCount: resolveDisplayImages(row.bioImages).length,
  };
};

/**
 * Describe a credit that stays hidden. A soft-deleted artist reports
 * `'deleted'` even when it is also off the roster, because restoring it is the
 * first step either way.
 */
export const toCreditThatStaysHidden = (row: HiddenCreditRow): CreditThatStaysHidden => ({
  id: row.id,
  slug: row.slug,
  name: getArtistDisplayName(row),
  reason: row.deletedOn == null ? 'no-departure-date' : 'deleted',
});
