/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { join } from 'node:path';
import { Readable } from 'node:stream';
import { buffer } from 'node:stream/consumers';
import { pipeline } from 'node:stream/promises';

import sharp from 'sharp';

import { reencodeImage, writeCard } from './image.js';
import { createWorkspace, fileSink, fileSource, removeWorkspace } from './lib/files.js';

import type { Sharp } from 'sharp';

/** A solid picture of the given size, ready to be written in any format. */
const solid = (width: number, height: number, background = '#c04020'): Sharp =>
  sharp({ create: { width, height, channels: 3, background } });

/** The failure code a rejected promise carries. */
const failureOf = async (run: Promise<unknown>): Promise<string | null> => {
  try {
    await run;
    return null;
  } catch (err) {
    return (err as { failure?: string }).failure ?? 'not-a-reencode-error';
  }
};

describe('image re-encode', () => {
  let dir: string;
  let input: string;

  const writeBytes = async (bytes: Buffer): Promise<void> => {
    await pipeline(Readable.from([bytes]), fileSink(input));
  };

  beforeEach(async () => {
    dir = await createWorkspace();
    // No extension, as the Lambda names it: the content decides, not the name.
    input = join(dir, 'upload');
  });

  afterEach(async () => {
    await removeWorkspace(dir);
  });

  describe('reencodeImage', () => {
    it('answers the files it wrote and what the picture is', async () => {
      await solid(400, 300).png().toFile(input);

      const output = await reencodeImage(input, dir);

      expect(output).toEqual({
        kind: 'IMAGE',
        copy: { name: 'copy.jpg', path: join(dir, 'copy.jpg'), contentType: 'image/jpeg' },
        card: { name: 'card.webp', path: join(dir, 'card.webp'), contentType: 'image/webp' },
        poster: null,
        width: 400,
        height: 300,
        durationSeconds: null,
      });
    });

    it('writes the copy as a JPEG', async () => {
      await solid(400, 300).png().toFile(input);

      const { copy } = await reencodeImage(input, dir);

      expect((await sharp(copy.path).metadata()).format).toBe('jpeg');
    });

    it('writes the card as a WebP', async () => {
      await solid(400, 300).png().toFile(input);

      await reencodeImage(input, dir);

      expect((await sharp(join(dir, 'card.webp')).metadata()).format).toBe('webp');
    });

    it.each(['jpeg', 'png', 'webp', 'gif', 'avif', 'tiff'] as const)(
      'decodes an accepted %s upload',
      async (format) => {
        await solid(64, 48).toFormat(format).toFile(input);

        const output = await reencodeImage(input, dir);

        expect([output.width, output.height]).toEqual([64, 48]);
      }
    );

    it('fits a large picture inside 2560 px on its long side', async () => {
      await solid(4000, 1000).jpeg().toFile(input);

      const output = await reencodeImage(input, dir);

      expect([output.width, output.height]).toEqual([2560, 640]);
    });

    it('fits a tall picture inside 2560 px on its long side', async () => {
      await solid(1000, 4000).jpeg().toFile(input);

      const output = await reencodeImage(input, dir);

      expect([output.width, output.height]).toEqual([640, 2560]);
    });

    it('writes the card 640 px wide', async () => {
      await solid(4000, 1000).jpeg().toFile(input);

      await reencodeImage(input, dir);

      const card = await sharp(join(dir, 'card.webp')).metadata();
      expect([card.width, card.height]).toEqual([640, 160]);
    });

    it('never enlarges a small picture, in the copy or the card', async () => {
      await solid(100, 50).png().toFile(input);

      const output = await reencodeImage(input, dir);

      const card = await sharp(join(dir, 'card.webp')).metadata();
      expect([output.width, output.height]).toEqual([100, 50]);
      expect([card.width, card.height]).toEqual([100, 50]);
    });

    it('bakes the orientation in and drops the tag', async () => {
      await solid(40, 20).withMetadata({ orientation: 6 }).jpeg().toFile(input);

      const output = await reencodeImage(input, dir);

      const copy = await sharp(output.copy.path).metadata();
      expect([output.width, output.height]).toEqual([20, 40]);
      expect(copy.orientation).toBeUndefined();
    });

    it('drops EXIF and colour-profile metadata from the copy and the card', async () => {
      await solid(40, 20)
        .withExif({ IFD0: { Copyright: 'someone', Artist: 'a stranger' } })
        .withIccProfile('p3')
        .jpeg()
        .toFile(input);

      const output = await reencodeImage(input, dir);

      const copy = await sharp(output.copy.path).metadata();
      const card = await sharp(join(dir, 'card.webp')).metadata();
      expect([copy.exif, copy.icc, copy.xmp, copy.iptc]).toEqual([
        undefined,
        undefined,
        undefined,
        undefined,
      ]);
      expect([card.exif, card.icc, card.xmp]).toEqual([undefined, undefined, undefined]);
    });

    it('keeps only the first frame of an animated upload', async () => {
      const frames = Buffer.concat([Buffer.alloc(16 * 16 * 3, 0), Buffer.alloc(16 * 16 * 3, 255)]);
      await sharp(frames, { raw: { width: 16, height: 32, channels: 3, pageHeight: 16 } })
        .gif()
        .toFile(input);

      const output = await reencodeImage(input, dir);

      const card = await sharp(join(dir, 'card.webp'), { animated: true }).metadata();
      expect([output.width, output.height]).toEqual([16, 16]);
      expect(card.pages ?? 1).toBe(1);
    });

    it('lays a transparent picture on white', async () => {
      await sharp({
        create: { width: 8, height: 8, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
      })
        .png()
        .toFile(input);

      const output = await reencodeImage(input, dir);

      const pixels = await sharp(output.copy.path).raw().toBuffer();
      expect(Math.min(...pixels)).toBeGreaterThan(250);
    });

    it('refuses a file that is not a picture as unreadable', async () => {
      await writeBytes(Buffer.from('this is not a picture at all'));

      expect(await failureOf(reencodeImage(input, dir))).toBe('unreadable');
    });

    it('refuses a picture cut off part-way as unreadable', async () => {
      const whole = join(dir, 'whole');
      await sharp({
        create: {
          width: 600,
          height: 600,
          channels: 3,
          background: '#808080',
          noise: { type: 'gaussian', mean: 128, sigma: 60 },
        },
      })
        .jpeg()
        .toFile(whole);
      const bytes = await buffer(fileSource(whole));
      await writeBytes(bytes.subarray(0, Math.floor(bytes.length / 3)));

      expect(await failureOf(reencodeImage(input, dir))).toBe('unreadable');
    });

    it('refuses an SVG, which is a script for a renderer, as unreadable', async () => {
      await writeBytes(
        Buffer.from(
          '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><rect width="10" height="10"/></svg>'
        )
      );

      expect(await failureOf(reencodeImage(input, dir))).toBe('unreadable');
    });
  });

  describe('writeCard', () => {
    it('writes a 640 px wide WebP from a poster', async () => {
      const poster = join(dir, 'poster.jpg');
      await solid(1280, 720).jpeg().toFile(poster);

      const card = await writeCard(poster, dir);

      const written = await sharp(card.path).metadata();
      expect(card).toEqual({
        name: 'card.webp',
        path: join(dir, 'card.webp'),
        contentType: 'image/webp',
      });
      expect([written.format, written.width, written.height]).toEqual(['webp', 640, 360]);
    });
  });
});
