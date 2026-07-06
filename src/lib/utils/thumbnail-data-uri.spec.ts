/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import sharp from 'sharp';

import { imageToWebpDataUri } from './thumbnail-data-uri';

vi.mock('server-only', () => ({}));

// A real, decodable solid-colour image of the given size.
const makeImage = (width: number, height: number): Promise<Buffer> =>
  sharp({
    create: { width, height, channels: 3, background: { r: 128, g: 128, b: 128 } },
  })
    .png()
    .toBuffer();

// Decode a `data:image/webp;base64,…` URI back to sharp metadata.
const dataUriMetadata = (dataUri: string): Promise<sharp.Metadata> => {
  const base64 = dataUri.replace(/^data:image\/webp;base64,/, '');
  return sharp(Buffer.from(base64, 'base64')).metadata();
};

describe('imageToWebpDataUri', () => {
  it('returns a webp data URI', async () => {
    const dataUri = await imageToWebpDataUri(await makeImage(640, 400), 320);

    expect(dataUri.startsWith('data:image/webp;base64,')).toBe(true);
  });

  it('encodes real bytes that decode back to a webp image', async () => {
    const dataUri = await imageToWebpDataUri(await makeImage(640, 400), 320);
    const metadata = await dataUriMetadata(dataUri);

    expect(metadata.format).toBe('webp');
  });

  it('downscales a favicon source to a 32px-wide webp', async () => {
    const dataUri = await imageToWebpDataUri(await makeImage(256, 256), 32);
    const metadata = await dataUriMetadata(dataUri);

    expect(metadata.width).toBe(32);
  });

  it('caps a hero source at the requested 320px width (never above source)', async () => {
    const dataUri = await imageToWebpDataUri(await makeImage(1200, 800), 320);
    const metadata = await dataUriMetadata(dataUri);

    expect(metadata.width).toBe(320);
  });

  it('does not enlarge a source narrower than the target width', async () => {
    const dataUri = await imageToWebpDataUri(await makeImage(120, 90), 320);
    const metadata = await dataUriMetadata(dataUri);

    expect(metadata.width).toBe(120);
  });
});
