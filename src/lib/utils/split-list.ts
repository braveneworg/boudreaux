/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Split a comma-separated stored list (genres, instruments) into trimmed,
 * non-empty items. `null`/`undefined`/empty input yields an empty list.
 */
export const splitList = (value: string | null | undefined): string[] =>
  value
    ?.split(',')
    .map((item) => item.trim())
    .filter(Boolean) ?? [];
