/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Video-admin display variant: formats a duration in seconds as `m:ss`,
 * promoting to `h:mm:ss` once it reaches an hour. Fractional seconds are
 * floored. Returns a dash for `null`/`undefined`/negative/non-finite input so
 * callers can render the result directly in metadata rows without their own
 * guards. For player/track-list durations use {@link formatDuration} /
 * {@link formatDurationLong} instead.
 *
 * @param seconds - The duration in seconds (or `null`/`undefined` when unknown).
 * @returns The formatted duration, or `'-'` when the input is not a valid length.
 */
export const formatVideoDuration = (seconds: number | null | undefined): string => {
  if (seconds === null || seconds === undefined || !Number.isFinite(seconds) || seconds < 0) {
    return '-';
  }

  const total = Math.floor(seconds);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const secondsPart = (total % 60).toString().padStart(2, '0');

  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, '0')}:${secondsPart}`;
  }

  return `${minutes}:${secondsPart}`;
};

/**
 * Player/track-list variant: formats a duration in seconds as `m:ss` with no
 * hour rollover (`3600 → '60:00'`). Nullish input coerces to `0` (`'0:00'`);
 * negative/NaN input passes through the raw arithmetic unguarded. For metadata
 * rows that should render a dash for unknown values use
 * {@link formatVideoDuration} instead.
 */
export const formatDuration = (seconds: number | null | undefined): string => {
  const total = seconds ?? 0;
  const minutes = Math.floor(total / 60);
  const remainingSeconds = Math.floor(total % 60);

  return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
};

/**
 * Long-form player variant: below one hour delegates to {@link formatDuration}
 * (`m:ss`); at or above one hour renders `h:mm:ss` (`4210 → '1:10:10'`).
 */
export const formatDurationLong = (seconds: number): string =>
  seconds >= 3600 ? formatVideoDuration(seconds) : formatDuration(seconds);
