/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import sharp from 'sharp';

import {
  hammingDistance,
  perceptualDHash,
  NEAR_DUPLICATE_MAX_DISTANCE,
  laplacianVarianceSharpness,
  assessImageQuality,
  isBelowQualityFloor,
  MIN_IMAGE_DIMENSION,
  MIN_SHARPNESS_VARIANCE,
} from './image-quality';

vi.mock('server-only', () => ({}));

// A deterministic RGB image built from a per-pixel painter. channels=3.
const makeImage = async (
  width: number,
  height: number,
  paint: (x: number, y: number) => [number, number, number]
): Promise<Buffer> => {
  const data = Buffer.alloc(width * height * 3);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const [r, g, b] = paint(x, y);
      const i = (y * width + x) * 3;
      data.writeUInt8(r, i);
      data.writeUInt8(g, i + 1);
      data.writeUInt8(b, i + 2);
    }
  }
  return sharp(data, { raw: { width, height, channels: 3 } })
    .png()
    .toBuffer();
};

const horizontalGradient = (width: number, height: number): Promise<Buffer> =>
  makeImage(width, height, (x) => {
    const v = Math.round((x / (width - 1)) * 255);
    return [v, v, v];
  });

describe('hammingDistance', () => {
  it('is 0 for identical hashes', () => {
    expect(hammingDistance(0xffffn, 0xffffn)).toBe(0);
  });

  it('counts a single differing bit', () => {
    expect(hammingDistance(0b1010n, 0b1011n)).toBe(1);
  });

  it('counts all 64 bits differing', () => {
    const allOnes = (1n << 64n) - 1n;
    expect(hammingDistance(allOnes, 0n)).toBe(64);
  });
});

describe('perceptualDHash', () => {
  it('hashes the same photo at two sizes to a near-identical value', async () => {
    const big = await horizontalGradient(200, 160);
    const small = await horizontalGradient(80, 64);

    const hashBig = await perceptualDHash(big);
    const hashSmall = await perceptualDHash(small);

    expect(hammingDistance(hashBig, hashSmall)).toBeLessThanOrEqual(NEAR_DUPLICATE_MAX_DISTANCE);
  });

  it('hashes visually different images far apart', async () => {
    const gradient = await horizontalGradient(120, 96);
    const checkerboard = await makeImage(120, 96, (x, y) => {
      const on = (Math.floor(x / 8) + Math.floor(y / 8)) % 2 === 0;
      const v = on ? 255 : 0;
      return [v, v, v];
    });

    const distance = hammingDistance(
      await perceptualDHash(gradient),
      await perceptualDHash(checkerboard)
    );

    expect(distance).toBeGreaterThan(NEAR_DUPLICATE_MAX_DISTANCE);
  });
});

describe('laplacianVarianceSharpness', () => {
  it('scores a high-contrast checkerboard far above a flat image', async () => {
    const checkerboard = await makeImage(120, 96, (x, y) => {
      const on = (Math.floor(x / 4) + Math.floor(y / 4)) % 2 === 0;
      const v = on ? 255 : 0;
      return [v, v, v];
    });
    const flat = await makeImage(120, 96, () => [128, 128, 128]);

    const sharpScore = await laplacianVarianceSharpness(checkerboard);
    const flatScore = await laplacianVarianceSharpness(flat);

    expect(sharpScore).toBeGreaterThan(flatScore);
  });

  it('scores a flat image below the sharpness floor', async () => {
    const flat = await makeImage(120, 96, () => [128, 128, 128]);
    expect(await laplacianVarianceSharpness(flat)).toBeLessThan(MIN_SHARPNESS_VARIANCE);
  });

  it('scores a crisp checkerboard above the sharpness floor', async () => {
    const checkerboard = await makeImage(120, 96, (x, y) => {
      const on = (Math.floor(x / 4) + Math.floor(y / 4)) % 2 === 0;
      const v = on ? 255 : 0;
      return [v, v, v];
    });
    expect(await laplacianVarianceSharpness(checkerboard)).toBeGreaterThan(MIN_SHARPNESS_VARIANCE);
  });
});

describe('assessImageQuality', () => {
  it('reports the original dimensions and populated metrics', async () => {
    const image = await makeImage(240, 180, (x, y) => {
      const on = (Math.floor(x / 4) + Math.floor(y / 4)) % 2 === 0;
      const v = on ? 255 : 0;
      return [v, v, v];
    });

    const assessment = await assessImageQuality(image);

    expect(assessment.width).toBe(240);
    expect(assessment.height).toBe(180);
    expect(assessment.sharpness).toBeGreaterThan(0);
    expect(typeof assessment.dHash).toBe('bigint');
  });
});

describe('isBelowQualityFloor', () => {
  it('rejects an image below the minimum dimension', () => {
    expect(
      isBelowQualityFloor({
        width: MIN_IMAGE_DIMENSION - 1,
        height: 400,
        sharpness: 500,
        dHash: 0n,
      })
    ).toBe(true);
  });

  it('rejects an image below the sharpness floor', () => {
    expect(
      isBelowQualityFloor({
        width: 400,
        height: 400,
        sharpness: MIN_SHARPNESS_VARIANCE - 1,
        dHash: 0n,
      })
    ).toBe(true);
  });

  it('passes an image that clears both floors', () => {
    expect(
      isBelowQualityFloor({
        width: 400,
        height: 400,
        sharpness: MIN_SHARPNESS_VARIANCE + 1,
        dHash: 0n,
      })
    ).toBe(false);
  });
});
