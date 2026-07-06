/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import 'server-only';

import sharp from 'sharp';

/**
 * Downscale `buffer` to a `width`-wide webp and return it as a base64
 * `data:image/webp` URI. `withoutEnlargement` keeps a source narrower than
 * `width` at its original size (never upscaled); quality 70 balances the
 * inline payload size against legibility for a bounded preview thumbnail.
 *
 * @param buffer - Raw source image bytes (already SSRF-fetched + byte-capped).
 * @param width - Target width in px (hero 320, favicon 32).
 * @returns A `data:image/webp;base64,…` URI of the re-encoded image.
 */
export const imageToWebpDataUri = async (buffer: Buffer, width: number): Promise<string> => {
  const output = await sharp(buffer)
    .resize({ width, withoutEnlargement: true })
    .webp({ quality: 70 })
    .toBuffer();
  return `data:image/webp;base64,${output.toString('base64')}`;
};
