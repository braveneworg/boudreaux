/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Format a duration in seconds as `m:ss`, promoting to `h:mm:ss` once it
 * reaches an hour. Fractional seconds are floored. Returns a dash for
 * `null`/`undefined`/negative/non-finite input so callers can render the result
 * directly in metadata rows without their own guards.
 *
 * @param seconds - The duration in seconds (or `null`/`undefined` when unknown).
 * @returns The formatted duration, or `'-'` when the input is not a valid length.
 */
export const formatDuration = (seconds: number | null | undefined): string => {
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
