/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

export const BANNER_SLOTS = [
  { slotNumber: 1, filename: 'FFINC Banner 1_5_1920.webp' },
  { slotNumber: 2, filename: 'FFINC Banner 2_5_1920.webp' },
  { slotNumber: 3, filename: 'FFINC Banner 3_5_1920.webp' },
  { slotNumber: 4, filename: 'FFINC Banner 4_5_1920.webp' },
  { slotNumber: 5, filename: 'FFINC Banner 5_5_1920.webp' },
] as const;

export const BANNER_CDN_PATH = 'media/banners';

/**
 * `padding-bottom` value reserving banner vertical space, derived from the
 * source's 1920×1097 aspect ratio (1097 / 1920 ≈ 57.14%). Used by both the
 * carousel container and the loading skeleton — drift causes CLS when the
 * skeleton swaps to the real banner.
 */
export const BANNER_ASPECT_PADDING = '57.14%';

export const DEFAULT_ROTATION_INTERVAL = 6.5;

export const MIN_ROTATION_INTERVAL = 3;

export const MAX_ROTATION_INTERVAL = 15;

export const ROTATION_INTERVAL_SETTINGS_KEY = 'carousel-rotation-interval';
