/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The one digital format a public surface plays. Its files sit behind a
 * public CloudFront behavior and are served unsigned; every other format is
 * paid content behind the trusted key group and reaches a listener only
 * through the download gate (ADR-0018). A public payload therefore carries
 * this format and nothing else.
 */
export const PLAYABLE_FORMAT_TYPE = 'MP3_320KBPS';

/** The fields that decide whether a format may appear on a public surface. */
export interface PlayableFormatCandidate {
  formatType: string;
  /** Withdrawn when set (soft-deleted); absent or null when active. */
  deletedAt?: Date | string | null;
}

/** Whether a format may be played on a public surface: the playable type, not withdrawn. */
export const isPlayableFormat = (format: PlayableFormatCandidate): boolean =>
  format.formatType === PLAYABLE_FORMAT_TYPE && !format.deletedAt;
