/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { DOWNLOAD_RESET_HOURS } from '@/lib/constants';

/**
 * Computes the number of whole hours remaining until the per-release download
 * limit resets, given the timestamp of the user's last download.
 *
 * Returns null when there is no active reset window (i.e. the window has
 * already elapsed or no timestamp is available).
 *
 * The result is clamped between 1 and DOWNLOAD_RESET_HOURS (6).
 */
export function computeResetInHours(lastDownloadedAt: Date | string | null): number | null {
  if (!lastDownloadedAt) return null;
  const resetMs = DOWNLOAD_RESET_HOURS * 60 * 60 * 1000;
  const elapsed = Date.now() - new Date(lastDownloadedAt).getTime();
  const remainingMs = resetMs - elapsed;
  if (remainingMs <= 0) return null;
  return Math.min(DOWNLOAD_RESET_HOURS, Math.max(1, Math.ceil(remainingMs / (60 * 60 * 1000))));
}
