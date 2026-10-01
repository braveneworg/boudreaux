/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { format } from 'date-fns';

/**
 * Day-precision ISO date helpers (`YYYY-MM-DD`). Shared by the client forms,
 * the release description-lookup route, the suggestion apply action, and the
 * release-date lookup service so every layer agrees on what "a day" is.
 * Import-safe from Client Components (no server-only dependencies).
 */

/** Strict `YYYY-MM-DD` shape gate (day-precision, zero-padded). */
export const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Real-calendar validity for a day-precision date string. A regex alone is
 * insufficient (it accepts `2020-13-45` / `2021-02-30`), so the parsed UTC
 * components must round-trip back to the input: impossible months/days
 * overflow into another month and fail the equality check.
 */
export const isRealCalendarDate = (value: string): boolean => {
  if (!ISO_DATE_PATTERN.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  return (
    parsed.getUTCFullYear() === year &&
    parsed.getUTCMonth() === month - 1 &&
    parsed.getUTCDate() === day
  );
};

/**
 * A Video's **release date**: one day-precision UTC calendar day as
 * `YYYY-MM-DD` (ADR-0004). The brand marks a string that came through one of
 * the two constructors below, so the editorial rules compare like with like.
 * Which constructor applies depends on where the value came from — a form
 * string and a stored `Date` name their day differently.
 */
export type ReleaseDay = string & { readonly __brand: 'ReleaseDay' };

/** Narrow a string to a `ReleaseDay`: strict shape and a real calendar day. */
export const isReleaseDay = (value: string): value is ReleaseDay => isRealCalendarDate(value);

/**
 * The release day a FORM value names, or `null`.
 *
 * - A `YYYY-MM-DD` string passes through unchanged.
 * - An ISO datetime collapses to its LOCAL day: the DatePicker commits
 *   `date.toISOString()` for a Date built at local midnight, so the day the
 *   admin picked is the local one (the UTC day can be the previous day east of
 *   Greenwich).
 * - Anything empty or unparseable is `null`.
 */
export const releaseDayFromForm = (value: string | null | undefined): ReleaseDay | null => {
  if (!value) return null;
  if (ISO_DATE_PATTERN.test(value)) return value as ReleaseDay;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : (format(parsed, 'yyyy-MM-dd') as ReleaseDay);
};

/**
 * The release day a STORED value names, or `null`. `releasedOn` is persisted
 * at UTC midnight, so its day is the UTC day — never the local one, which is
 * the previous day west of Greenwich.
 */
export const releaseDayFromStored = (value: Date | null | undefined): ReleaseDay | null =>
  value && !Number.isNaN(value.getTime()) ? (value.toISOString().slice(0, 10) as ReleaseDay) : null;

/** Today's UTC calendar day as `YYYY-MM-DD` (`now` injectable for tests). */
export const todayUtcIsoDate = (now: Date = new Date()): ReleaseDay =>
  now.toISOString().slice(0, 10) as ReleaseDay;

/**
 * Whether a `YYYY-MM-DD` day is today's UTC day. A release-date lookup that
 * lands on today is treated as "not found": a release date is never inferred,
 * and today only ever appears because a human typed it (ADR-0004).
 */
export const isTodayUtc = (day: string, now: Date = new Date()): boolean =>
  day === todayUtcIsoDate(now);
