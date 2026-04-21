/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Device sizes we generate `_w{width}` variants for. Capped at 1200 on purpose:
 * `generate-image-variants.ts` skips widths `>= originalWidth`, so a 1920px
 * original would never get a `_w1920` variant, and requesting one produces
 * `ERR_BLOCKED_BY_ORB` (CDN) or 403 (origin) instead of a clean 404.
 */
export const IMAGE_VARIANT_DEVICE_SIZES = [640, 750, 828, 1080, 1200] as const;
export const IMAGE_VARIANT_SUFFIX_REGEX = /_w\d+\.[^/.]+$/i;
