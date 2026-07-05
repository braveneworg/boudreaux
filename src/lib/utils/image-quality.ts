/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import 'server-only';

import sharp from 'sharp';

/**
 * Maximum Hamming distance between two 64-bit dHashes for two images to count
 * as perceptual near-duplicates (resized / re-encoded copies of one photo).
 * 0 = identical hash, 64 = maximally different. Tunable.
 */
export const NEAR_DUPLICATE_MAX_DISTANCE = 10;

/** dHash grid: (DHASH_WIDTH - 1) comparisons per row x DHASH_HEIGHT rows = 64 bits. */
const DHASH_WIDTH = 9;
const DHASH_HEIGHT = 8;

/** Count differing bits between two 64-bit perceptual hashes. */
export const hammingDistance = (a: bigint, b: bigint): number => {
  let xor = a ^ b;
  let distance = 0;
  while (xor > 0n) {
    distance += Number(xor & 1n);
    xor >>= 1n;
  }
  return distance;
};

/**
 * Compute a 64-bit difference hash (dHash). The image is reduced to a 9x8
 * greyscale grid; each of the 8 rows contributes 8 bits, one per
 * adjacent-pixel comparison (left brighter than right -> 1). Robust to
 * rescaling and re-encoding, so near-identical photos hash close together.
 */
export const perceptualDHash = async (buffer: Buffer): Promise<bigint> => {
  const { data } = await sharp(buffer)
    .greyscale()
    .resize(DHASH_WIDTH, DHASH_HEIGHT, { fit: 'fill' })
    .raw()
    .toBuffer({ resolveWithObject: true });

  let hash = 0n;
  for (let row = 0; row < DHASH_HEIGHT; row++) {
    for (let col = 0; col < DHASH_WIDTH - 1; col++) {
      const left = data[row * DHASH_WIDTH + col];
      const right = data[row * DHASH_WIDTH + col + 1];
      hash = (hash << 1n) | (left > right ? 1n : 0n);
    }
  }
  return hash;
};
