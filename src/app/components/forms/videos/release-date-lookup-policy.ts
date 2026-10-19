/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { isTodayMiss } from '@/lib/services/video-editorial-rules';
import { isRealCalendarDate, todayUtcIsoDate } from '@/lib/utils/validation/iso-date';

import type { VideoUploadStatus } from './use-video-upload';

/**
 * Pure policy for the automatic release-date lookup: when it may run, how a
 * (title, artist) pair is keyed, how many attempts a pair gets and how they
 * are spaced, and what counts as a find. The hook that drives the timers and
 * the query lives in `use-release-date-auto-lookup.ts`; nothing here touches
 * React or the network so every rule is a table test.
 */

/**
 * Delay before each attempt, in order: the first fires immediately, the
 * retries wait 20s then 60s (≈80s per pair in total). The length IS the
 * attempt budget. One constant to tweak if the wait feels long.
 */
export const RELEASE_DATE_LOOKUP_DELAYS_MS: readonly number[] = [0, 20_000, 60_000];

/** The facts the lookup gate is decided on. */
export interface ReleaseDateLookupGate {
  /** The multipart upload state machine's status. */
  uploadStatus: VideoUploadStatus;
  /** True once a Video row exists (edit mode, or the draft created at upload). */
  hasPersistedRow: boolean;
  category: string | undefined;
  title: string | undefined;
  artist: string | undefined;
  releasedOn: string | undefined;
}

/**
 * Whether the automatic lookup may run right now. It needs both halves of the
 * search (title AND artist — the prose must name the artist, and the pair is
 * the budget key), a MUSIC video, an EMPTY date (a date the admin typed or a
 * previous run found is never re-searched), and either an upload that has
 * started (`uploading` / `success` — the title/artist prefill lands at file
 * selection, and the draft row follows at upload-complete) or an already
 * persisted row (edit-open of a dateless draft). `preparing` and `idle`
 * without a row stay closed.
 */
export const shouldLookupReleaseDate = ({
  uploadStatus,
  hasPersistedRow,
  category,
  title,
  artist,
  releasedOn,
}: ReleaseDateLookupGate): boolean => {
  const uploadStarted = uploadStatus === 'uploading' || uploadStatus === 'success';
  return (
    (uploadStarted || hasPersistedRow) &&
    category === 'MUSIC' &&
    Boolean(title?.trim()) &&
    Boolean(artist?.trim()) &&
    !releasedOn?.trim()
  );
};

/** Budget key for a (title, artist) pair — whitespace and case insensitive. */
export const lookupPairKey = (title: string, artist: string): string =>
  `${title.trim().toLowerCase()}\u0000${artist.trim().toLowerCase()}`;

/** Attempts spent on one pair (immutable; see {@link recordLookupAttempt}). */
export interface LookupBudget {
  attempts: number;
}

/** A fresh, unspent budget. */
export const createLookupBudget = (): LookupBudget => ({ attempts: 0 });

/** The budget after one more attempt has started. */
export const recordLookupAttempt = (budget: LookupBudget): LookupBudget => ({
  attempts: budget.attempts + 1,
});

/** True once every attempt in {@link RELEASE_DATE_LOOKUP_DELAYS_MS} is spent. */
export const isLookupBudgetExhausted = (budget: LookupBudget): boolean =>
  budget.attempts >= RELEASE_DATE_LOOKUP_DELAYS_MS.length;

/** Delay before the next attempt, or `null` when the budget is exhausted. */
export const nextAttemptDelayMs = (budget: LookupBudget): number | null =>
  isLookupBudgetExhausted(budget) ? null : RELEASE_DATE_LOOKUP_DELAYS_MS[budget.attempts];

/** What one attempt yielded. */
export type LookupOutcome = { kind: 'found'; releasedOn: string } | { kind: 'miss' };

/**
 * Classify a lookup response. Anything but a real, past calendar day is a
 * miss: `null` (nothing found), a malformed value, and — the client
 * double-guard of the server rule — today's UTC day, which is never a
 * release date (ADR-0004).
 */
export const classifyLookupResult = (
  result: { releasedOn: string } | null | undefined,
  now: Date = new Date()
): LookupOutcome => {
  if (!result) return { kind: 'miss' };
  const { releasedOn } = result;
  if (!isRealCalendarDate(releasedOn) || isTodayMiss(releasedOn, todayUtcIsoDate(now))) {
    return { kind: 'miss' };
  }
  return { kind: 'found', releasedOn };
};
