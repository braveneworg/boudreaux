/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { format } from 'date-fns';

/**
 * Day-precision ISO date helpers (`YYYY-MM-DD`). Shared by the client forms,
 * the description-lookup routes, the suggestion apply action, and the
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
 * Normalise a form date value to a `YYYY-MM-DD` day, or `null`.
 *
 * - A `YYYY-MM-DD` string passes through unchanged.
 * - An ISO datetime collapses to its LOCAL day: the DatePicker commits
 *   `date.toISOString()` for a Date built at local midnight, so the day the
 *   admin picked is the local one (the UTC day can be the previous day east of
 *   Greenwich).
 * - Anything empty or unparseable is `null`.
 */
export const toIsoDay = (value: string | null | undefined): string | null => {
  if (!value) return null;
  if (ISO_DATE_PATTERN.test(value)) return value;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : format(parsed, 'yyyy-MM-dd');
};

/** Today's UTC calendar day as `YYYY-MM-DD` (`now` injectable for tests). */
export const todayUtcIsoDate = (now: Date = new Date()): string => now.toISOString().slice(0, 10);

/**
 * Whether a `YYYY-MM-DD` day is today's UTC day. A release-date lookup that
 * lands on today is treated as "not found": a release date is never inferred,
 * and today only ever appears because a human typed it (ADR-0004).
 */
export const isTodayUtc = (day: string, now: Date = new Date()): boolean =>
  day === todayUtcIsoDate(now);
