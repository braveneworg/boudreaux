/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Credit confirmation — what an admin is shown before a release's credited
 * artists are published with it (ADR-0015).
 *
 * A credit is **awaiting confirmation** when stamping `publishedOn` would make
 * its artist public: no `publishedOn`, not deleted. A credit **stays hidden**
 * when publishing cannot make it public, because the artist is soft-deleted.
 * Whether the artist is still on the label plays no part (ADR-0016).
 *
 * Pure and client-safe: the repository, the confirmation dialog and the
 * backfill script all describe a credit through here.
 */

import { countChosenDisplayImages, type DisplayImageCandidate } from './display-images';
import { getArtistDisplayName, type ArtistNameFields } from './get-artist-display-name';

/** What kind of bio goes public with an artist. */
export type CreditBioState = 'none' | 'hand-written' | 'generated';

/** Why publishing an artist would still leave it hidden. */
export type HiddenCreditReason = 'deleted';

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

/** A release's credits as publication sees them. */
export interface CreditConfirmation {
  awaiting: CreditAwaitingConfirmation[];
  stayHidden: CreditThatStaysHidden[];
}

/**
 * What an admin decided for each credit awaiting confirmation. Together the
 * two lists must cover every awaiting credit: an artist is published or kept
 * hidden by a decision, never by omission.
 */
export interface CreditDecisions {
  publishArtistIds: string[];
  keepHiddenArtistIds: string[];
}

/** The decisions of a write that names no artist. Passes only when nothing awaits. */
export const NO_CREDIT_DECISIONS: CreditDecisions = {
  publishArtistIds: [],
  keepHiddenArtistIds: [],
};

/** The outcome of checking decisions against the credits awaiting confirmation. */
export type CreditDecisionCheck = { ok: true } | { ok: false; error: string };

/** The public work that carries an artist's name, listed before hiding it. */
export interface PublishedWorkCreditedTo {
  releases: Array<{
    id: string;
    title: string;
    /**
     * The artist is the release's first credit (its album artist), so hiding
     * the artist leaves the release with no byline (ADR-0015).
     */
    leavesNoByline: boolean;
  }>;
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
    // Chosen images only (ADR-0019): a suggestion the fallback would show is
    // not a human's choice and does not make the artist publishable.
    displayImageCount: countChosenDisplayImages(row.bioImages),
  };
};

/** Describe a credit that stays hidden: its artist is soft-deleted. */
export const toCreditThatStaysHidden = (row: HiddenCreditRow): CreditThatStaysHidden => ({
  id: row.id,
  slug: row.slug,
  name: getArtistDisplayName(row),
  reason: 'deleted',
});

/** Whether a publish must stop and ask: some credit awaits a decision. */
export const needsCreditDecisions = ({ awaiting }: CreditConfirmation): boolean =>
  awaiting.length > 0;

const names = (credits: CreditAwaitingConfirmation[]): string =>
  credits.map(({ name }) => name).join(', ');

/**
 * Check an admin's decisions against the credits awaiting confirmation.
 *
 * Fails when an artist is in both lists, when a published id does not await
 * confirmation (it is not credited, already public, or stays hidden), or when
 * an awaiting credit is in neither list. A keep-hidden id that no longer
 * awaits confirmation is ignored: keeping it hidden writes nothing.
 */
export const checkCreditDecisions = (
  awaiting: CreditAwaitingConfirmation[],
  { publishArtistIds, keepHiddenArtistIds }: CreditDecisions
): CreditDecisionCheck => {
  const publish = new Set(publishArtistIds);
  const keepHidden = new Set(keepHiddenArtistIds);
  const awaitingIds = new Set(awaiting.map(({ id }) => id));

  const both = awaiting.filter(({ id }) => publish.has(id) && keepHidden.has(id));
  if (both.length > 0) {
    return {
      ok: false,
      error: `An artist cannot be both published and kept hidden: ${names(both)}`,
    };
  }

  const outside = publishArtistIds.filter((id) => !awaitingIds.has(id));
  if (outside.length > 0) {
    return {
      ok: false,
      error: `These artists cannot be published with this release: ${outside.join(', ')}`,
    };
  }

  // ADR-0019: publishing needs a chosen display image; such a credit can
  // only be kept hidden. Checked here so the release save's own transaction
  // refuses it too (publishConfirmedCredits runs this against stored rows).
  const imageless = awaiting.filter(
    ({ id, displayImageCount }) => publish.has(id) && displayImageCount === 0
  );
  if (imageless.length > 0) {
    return {
      ok: false,
      error: `These artists have no display image and can only be kept hidden: ${names(imageless)}`,
    };
  }

  const undecided = awaiting.filter(({ id }) => !publish.has(id) && !keepHidden.has(id));
  if (undecided.length > 0) {
    return { ok: false, error: `Choose to publish or keep hidden: ${names(undecided)}` };
  }

  return { ok: true };
};
