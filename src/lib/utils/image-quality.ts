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

/**
 * Minimum width AND height (px) an image must have to survive the gate. Below
 * this it is too small to render acceptably in a bio and is dropped. Tunable.
 */
export const MIN_IMAGE_DIMENSION = 200;

/**
 * Minimum Laplacian-response variance an image must have to survive the gate.
 * Blurry / out-of-focus images produce weak edges and a low variance; sharp
 * images produce a high one. Conservative initial floor — raise it if blurry
 * images slip through, lower it if crisp images are dropped. Tunable.
 */
export const MIN_SHARPNESS_VARIANCE = 60;

/** 3x3 discrete Laplacian kernel; convolving with it isolates edge energy. */
const LAPLACIAN_KERNEL = { width: 3, height: 3, kernel: [0, 1, 0, 1, -4, 1, 0, 1, 0] };

export interface ImageQualityAssessment {
  width: number;
  height: number;
  sharpness: number;
  dHash: bigint;
}

/**
 * Population variance of `values` (mean of squared deviations from the mean).
 * Returns `0` for an empty collection so callers never divide by zero. Iterates
 * by index so it accepts any `ArrayLike<number>` (Buffer, Uint8Array, number[]).
 */
export const variance = (values: ArrayLike<number>): number => {
  if (values.length === 0) {
    return 0;
  }

  const samples = Array.from(values);

  let sum = 0;
  for (const value of samples) {
    sum += value;
  }
  const mean = sum / samples.length;

  let squaredError = 0;
  for (const value of samples) {
    squaredError += (value - mean) ** 2;
  }
  return squaredError / samples.length;
};

/**
 * Score an image's sharpness as the variance of its Laplacian response over a
 * greyscale copy. A low score indicates a blurry / out-of-focus image.
 */
export const laplacianVarianceSharpness = async (buffer: Buffer): Promise<number> => {
  const { data } = await sharp(buffer)
    .greyscale()
    .convolve(LAPLACIAN_KERNEL)
    .raw()
    .toBuffer({ resolveWithObject: true });

  return variance(data);
};

/** Decode `buffer` to produce a full quality assessment. */
export const assessImageQuality = async (buffer: Buffer): Promise<ImageQualityAssessment> => {
  const metadata = await sharp(buffer).metadata();
  const [sharpness, dHash] = await Promise.all([
    laplacianVarianceSharpness(buffer),
    perceptualDHash(buffer),
  ]);
  return {
    width: metadata.width ?? 0,
    height: metadata.height ?? 0,
    sharpness,
    dHash,
  };
};

/**
 * True when an image fails the absolute quality floor (too small OR too blurry)
 * and must be dropped regardless of duplicates.
 */
export const isBelowQualityFloor = ({
  width,
  height,
  sharpness,
}: ImageQualityAssessment): boolean =>
  Math.min(width, height) < MIN_IMAGE_DIMENSION || sharpness < MIN_SHARPNESS_VARIANCE;
