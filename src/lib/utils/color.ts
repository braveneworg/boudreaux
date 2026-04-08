/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Returns true when the given hex color is perceptually dark,
 * using the W3C relative-luminance formula (sRGB).
 *
 * Accepts 3- or 6-digit hex strings with a leading `#`.
 * Falls back to `true` (dark) for unparseable values so that
 * white link text is chosen as a safe default.
 */
export function isDarkColor(hex: string | null | undefined): boolean {
  if (!hex) return true;

  const cleaned = hex.replace('#', '');
  let r: number;
  let g: number;
  let b: number;

  if (cleaned.length === 3) {
    r = parseInt(cleaned[0] + cleaned[0], 16);
    g = parseInt(cleaned[1] + cleaned[1], 16);
    b = parseInt(cleaned[2] + cleaned[2], 16);
  } else if (cleaned.length === 6) {
    r = parseInt(cleaned.slice(0, 2), 16);
    g = parseInt(cleaned.slice(2, 4), 16);
    b = parseInt(cleaned.slice(4, 6), 16);
  } else {
    return true;
  }

  // W3C relative luminance
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;

  if (Number.isNaN(luminance)) return true;

  return luminance < 0.5;
}
