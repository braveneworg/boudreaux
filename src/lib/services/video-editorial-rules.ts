/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import type { ReleaseDay } from '@/lib/utils/validation/iso-date';

/**
 * The Video editorial rules of ADR-0004 and ADR-0005 as pure decisions, so
 * they hold wherever a Video is written — the publish and release-date
 * actions, the enrichment callback, the suggestion action — and not only
 * while the edit form is mounted. Every caller reads its state, asks here,
 * and does the I/O; nothing in this module touches a store or a clock.
 *
 * - published ⇒ dated: a Video cannot be published without a release date
 *   and a published Video cannot lose it.
 * - A release-date suggestion fills only an empty release date, by itself.
 * - Today's UTC day is never filled by itself: today only ever appears
 *   because a human typed it.
 * - A blank description takes the synthesized one without review; a
 *   non-blank one is never overwritten by itself.
 * - A description suggestion is never dismissed.
 */

export type EditorialRefusal =
  'RELEASE_DATE_REQUIRED' | 'PUBLISHED_KEEPS_DATE' | 'DESCRIPTION_NEVER_DISMISSED';

export type EditorialDecision = { ok: true } | { ok: false; reason: EditorialRefusal };

const allow: EditorialDecision = { ok: true };
const refuse = (reason: EditorialRefusal): EditorialDecision => ({ ok: false, reason });

/** May this Video be published? */
export const decidePublish = ({ releasedOn }: { releasedOn: unknown }): EditorialDecision =>
  releasedOn ? allow : refuse('RELEASE_DATE_REQUIRED');

/** May this Video's release date become `incoming`? */
export const decideReleaseDate = (
  { publishedAt }: { publishedAt: Date | null },
  incoming: ReleaseDay | Date | null
): EditorialDecision =>
  incoming === null && publishedAt !== null ? refuse('PUBLISHED_KEEPS_DATE') : allow;

/** What the stored Video says about the two fields enrichment may fill. */
export interface EditorialState {
  releasedOn: ReleaseDay | null;
  description: string | null;
}

/** What one enrichment run offered for those fields, or null when it offered nothing. */
export interface EnrichmentOffer {
  releasedOn: ReleaseDay | null;
  description: string | null;
}

/** The values to write by themselves; null means leave the field for review. */
export interface EnrichmentAutoApply {
  releasedOn: ReleaseDay | null;
  description: string | null;
}

/**
 * Which of an enrichment run's offers take effect without a human: an empty
 * release date takes the offered day unless that day is today; a blank
 * description takes the offered prose. Anything else stays a pending
 * suggestion.
 */
export const decideEnrichmentAutoApply = ({
  state,
  offered,
  today,
}: {
  state: EditorialState;
  offered: EnrichmentOffer;
  today: ReleaseDay;
}): EnrichmentAutoApply => ({
  releasedOn:
    state.releasedOn === null && offered.releasedOn !== null && offered.releasedOn !== today
      ? offered.releasedOn
      : null,
  description: !state.description?.trim() && offered.description ? offered.description : null,
});

/** May this suggestion be dismissed? */
export const decideSuggestionDismiss = ({
  artistId,
  field,
}: {
  artistId: string | null;
  field: string;
}): EditorialDecision =>
  artistId === null && field === 'description' ? refuse('DESCRIPTION_NEVER_DISMISSED') : allow;
