/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Format a millisecond delta as a short human-readable countdown.
 *
 * Auto-scales the unit to the largest non-zero unit so the rendered string
 * fits in a compact UI badge:
 *
 * - `>= 1h` → `"Hh Mm"` (e.g. `"23h 14m"`)
 * - `>= 1m` → `"Mm"` (e.g. `"47m"`)
 * - `>= 0`  → `"Ss"` (e.g. `"32s"`, `"0s"`)
 * - `< 0`   → clamps to `"0s"`
 *
 * Used by the free-download cap "Download limit reached" countdown
 * (Session 2026-05-08 Q2). Deliberately stateless — callers feed it fresh
 * deltas from a 1-second `setInterval`.
 *
 * Feature: 007-free-digital-downloads (US2, T052).
 */
export function formatTimeRemaining(deltaMs: number): string {
  if (!Number.isFinite(deltaMs) || deltaMs <= 0) {
    return '0s';
  }

  const totalSeconds = Math.floor(deltaMs / 1000);
  const totalMinutes = Math.floor(totalSeconds / 60);
  const totalHours = Math.floor(totalMinutes / 60);

  if (totalHours >= 1) {
    const minutes = totalMinutes - totalHours * 60;
    return `${totalHours}h ${minutes}m`;
  }
  if (totalMinutes >= 1) {
    return `${totalMinutes}m`;
  }
  return `${totalSeconds}s`;
}
