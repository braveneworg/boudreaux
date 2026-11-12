/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { join } from 'node:path';

import sharp from 'sharp';

import { toErrorMessage } from './lib/log.js';
import {
  ATTACHMENT_CARD_WIDTH,
  ATTACHMENT_IMAGE_MAX_EDGE,
  ATTACHMENT_IMAGE_QUALITY,
  ReencodeError,
} from './types.js';

import type { ReencodeOutput, WrittenFile } from './types.js';
import type { Sharp } from 'sharp';

/**
 * The most pixels a picture may decode to. A 20 MB file can claim far more,
 * and the decoder allocates for what the header claims.
 */
const INPUT_PIXEL_LIMIT = 100_000_000;

/** What a transparent picture is laid on, since a JPEG has no transparency. */
const FLATTEN_BACKGROUND = '#ffffff';

// Only the six accepted formats can be opened at all: every loader is blocked
// and those six are let back in. An SVG is a script for a renderer and a PDF a
// program; neither is ever handed to its library, whatever the upload's type
// claimed. This is process-wide and set once, when the module loads.
sharp.block({ operation: ['VipsForeignLoad'] });
sharp.unblock({
  operation: [
    'VipsForeignLoadJpegFile',
    'VipsForeignLoadPngFile',
    'VipsForeignLoadWebpFile',
    'VipsForeignLoadNsgifFile',
    'VipsForeignLoadHeifFile',
    'VipsForeignLoadTiffFile',
  ],
});
// No cache: a cached file handle would outlive the temp dir it points into.
sharp.cache(false);

/**
 * Open a file as one still picture, upright and opaque. The first frame only
 * of an animation; `rotate()` bakes the orientation tag into the pixels. sharp
 * writes no metadata unless asked, so EXIF, XMP, IPTC and the colour profile
 * all stay behind.
 */
const openPicture = (path: string): Sharp =>
  sharp(path, { failOn: 'error', limitInputPixels: INPUT_PIXEL_LIMIT, pages: 1, page: 0 })
    .rotate()
    .flatten({ background: FLATTEN_BACKGROUND });

const cardFile = (outDir: string): WrittenFile => ({
  name: 'card.webp',
  path: join(outDir, 'card.webp'),
  contentType: 'image/webp',
});

/** Write the card of an opened picture: 640 px wide at most, as WebP. */
const writeCardOf = async (picture: Sharp, outDir: string): Promise<WrittenFile> => {
  const card = cardFile(outDir);
  await picture
    .resize({ width: ATTACHMENT_CARD_WIDTH, withoutEnlargement: true })
    .webp({ quality: ATTACHMENT_IMAGE_QUALITY })
    .toFile(card.path);

  return card;
};

/**
 * Write `card.webp` from a picture the Lambda itself wrote (a video's poster).
 *
 * @throws ReencodeError `failed`: the poster is ours, so a failure is ours too.
 */
export const writeCard = async (sourcePath: string, outDir: string): Promise<WrittenFile> => {
  try {
    return await writeCardOf(openPicture(sourcePath), outDir);
  } catch (err) {
    throw new ReencodeError('failed', `the card could not be written: ${toErrorMessage(err)}`);
  }
};

/**
 * Re-encode an uploaded picture: `copy.jpg`, at most 2560 px on its long side,
 * and `card.webp`. Both are written from the decoded pixels and nothing else.
 *
 * @throws ReencodeError `unreadable` when sharp cannot decode the file — it is
 * not a picture, not one of the accepted formats, damaged, or larger than the
 * pixel limit.
 */
export const reencodeImage = async (inputPath: string, outDir: string): Promise<ReencodeOutput> => {
  const copyPath = join(outDir, 'copy.jpg');
  try {
    const { width, height } = await openPicture(inputPath)
      .resize({
        width: ATTACHMENT_IMAGE_MAX_EDGE,
        height: ATTACHMENT_IMAGE_MAX_EDGE,
        fit: 'inside',
        withoutEnlargement: true,
      })
      .jpeg({ quality: ATTACHMENT_IMAGE_QUALITY, mozjpeg: true })
      .toFile(copyPath);
    const card = await writeCardOf(openPicture(inputPath), outDir);

    return {
      kind: 'IMAGE',
      copy: { name: 'copy.jpg', path: copyPath, contentType: 'image/jpeg' },
      card,
      poster: null,
      width,
      height,
      durationSeconds: null,
    };
  } catch (err) {
    throw new ReencodeError('unreadable', `sharp could not decode it: ${toErrorMessage(err)}`);
  }
};
