/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Timezone utility functions.
 *
 * All conversion and formatting is done via the ECMA-402 Intl API — no
 * external dependencies required.
 */

/**
 * Convert a local datetime string ("YYYY-MM-DDTHH:mm") expressed in the
 * given IANA timezone to the equivalent UTC Date.
 *
 * Uses a two-pass iterative Intl approximation so that DST transitions are
 * handled correctly without any third-party library.
 *
 * @param localDateTimeStr - A string in "YYYY-MM-DDTHH:mm" format (no trailing Z).
 * @param timeZone         - IANA timezone identifier, e.g. "America/Chicago".
 */
export function localToUTC(localDateTimeStr: string, timeZone: string): Date {
  const [datePart, timePart] = localDateTimeStr.split('T');
  const [year, month, day] = datePart.split('-').map(Number);
  const [hour, minute] = timePart.split(':').map(Number);

  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });

  /**
   * Given a UTC timestamp, return the local date-time parts in the target tz.
   */
  function getLocalParts(utcMs: number): {
    year: number;
    month: number;
    day: number;
    hour: number;
    minute: number;
  } {
    const parts = Object.fromEntries(
      formatter.formatToParts(new Date(utcMs)).map(({ type, value }) => [type, value])
    );
    return {
      year: Number(parts.year),
      month: Number(parts.month),
      day: Number(parts.day),
      hour: parts.hour === '24' ? 0 : Number(parts.hour),
      minute: Number(parts.minute),
    };
  }

  // Initial UTC estimate using the wall-clock values as if they were UTC.
  let estimate = Date.UTC(year, month - 1, day, hour, minute);

  // Two passes are sufficient to handle all DST transitions.
  for (let i = 0; i < 2; i++) {
    const local = getLocalParts(estimate);
    const diffMs =
      Date.UTC(local.year, local.month - 1, local.day, local.hour, local.minute) -
      Date.UTC(year, month - 1, day, hour, minute);
    estimate -= diffMs;
  }

  return new Date(estimate);
}

/**
 * Return the UTC offset in minutes for an IANA timezone at a specific Date.
 *
 * e.g. "America/Chicago" on a summer date → -300 (CDT = UTC-5).
 *
 * @param timeZone - IANA timezone identifier.
 * @param date     - The reference date (defaults to now).
 */
export function getTimezoneOffsetMinutes(timeZone: string, date: Date = new Date()): number {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });

  const parts = Object.fromEntries(
    formatter.formatToParts(date).map(({ type, value }) => [type, value])
  );

  const hour = parts.hour === '24' ? 0 : Number(parts.hour);
  const localMs = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    hour,
    Number(parts.minute),
    Number(parts.second)
  );

  return Math.round((localMs - date.getTime()) / 60_000);
}

/**
 * Return a UTC offset label like "UTC-05:00" or "UTC+05:30".
 *
 * @param timeZone - IANA timezone identifier.
 * @param date     - Reference date (defaults to now).
 */
export function formatUTCOffset(timeZone: string, date: Date = new Date()): string {
  const offsetMinutes = getTimezoneOffsetMinutes(timeZone, date);
  const sign = offsetMinutes >= 0 ? '+' : '-';
  const abs = Math.abs(offsetMinutes);
  const hh = String(Math.floor(abs / 60)).padStart(2, '0');
  const mm = String(abs % 60).padStart(2, '0');
  return `UTC${sign}${hh}:${mm}`;
}

/**
 * Format a stored UTC date for display in the given IANA timezone.
 * Falls back to the viewer's local timezone when timeZone is null/undefined.
 *
 * @param date     - UTC Date object or ISO string.
 * @param timeZone - IANA timezone identifier.
 * @param options  - Additional Intl.DateTimeFormatOptions overrides.
 */
export function formatTourDate(
  date: Date | string,
  timeZone?: string | null,
  options?: Intl.DateTimeFormatOptions
): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  const baseOptions: Intl.DateTimeFormatOptions = {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    ...options,
  };
  if (timeZone) {
    baseOptions.timeZone = timeZone;
  }
  return new Intl.DateTimeFormat('en-US', baseOptions).format(d);
}

/**
 * Format a stored UTC date as a time string in the given IANA timezone.
 * Falls back to the viewer's local timezone when timeZone is null/undefined.
 *
 * @param date     - UTC Date object or ISO string.
 * @param timeZone - IANA timezone identifier.
 * @param options  - Additional Intl.DateTimeFormatOptions overrides.
 */
export function formatTourTime(
  date: Date | string,
  timeZone?: string | null,
  options?: Intl.DateTimeFormatOptions
): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  const baseOptions: Intl.DateTimeFormatOptions = {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
    ...options,
  };
  if (timeZone) {
    baseOptions.timeZone = timeZone;
  }
  return new Intl.DateTimeFormat('en-US', baseOptions).format(d);
}

/**
 * Convert a stored UTC date back to a "YYYY-MM-DDTHH:mm" string expressed in
 * the given IANA timezone.  This is the inverse of localToUTC and is used to
 * pre-populate datetime form fields so the admin sees venue-local times, not
 * UTC times.
 *
 * @param date     - UTC Date object or ISO string.
 * @param timeZone - IANA timezone identifier.
 */
export function toLocalDateTimeString(date: Date | string, timeZone: string): string {
  const d = typeof date === 'string' ? new Date(date) : date;

  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });

  const parts = Object.fromEntries(
    formatter.formatToParts(d).map(({ type, value }) => [type, value])
  );

  // Intl sometimes returns "24" for midnight — normalise to "00".
  const hour = parts.hour === '24' ? '00' : parts.hour;
  return `${parts.year}-${parts.month}-${parts.day}T${hour}:${parts.minute}`;
}
