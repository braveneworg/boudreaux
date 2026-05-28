#!/usr/bin/env node

/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * One-time script to generate PWA icons from the brand logo SVG.
 *
 * The source logo (`public/fake-four-inc-black-hand-logo.svg`) is a solid
 * black mark on a transparent background, so it would be invisible against a
 * dark OS launcher. Each icon is therefore composited onto a solid white
 * background. Two variants are produced:
 *
 *   - "any" icons: the logo is inset with generous padding so it reads well as
 *     a small launcher tile.
 *   - "maskable" icons: the logo is inset further (~60% of the canvas) so the
 *     whole mark stays inside the Android safe zone when the OS applies a
 *     circular/squircle mask.
 *
 * Usage:
 *   pnpm run pwa:generate-icons
 */

import { mkdir } from 'node:fs/promises';
import path from 'node:path';

import sharp from 'sharp';

const PROJECT_ROOT = path.resolve(import.meta.dirname, '..');
const SOURCE_LOGO = path.join(PROJECT_ROOT, 'public', 'fake-four-inc-black-hand-logo.svg');
const OUTPUT_DIR = path.join(PROJECT_ROOT, 'public', 'icons');

const BACKGROUND = { r: 255, g: 255, b: 255, alpha: 1 } as const;

interface IconSpec {
  readonly fileName: string;
  readonly size: number;
  /** Fraction of the canvas the logo should occupy (rest is padding). */
  readonly contentScale: number;
}

const ICON_SPECS: readonly IconSpec[] = [
  { fileName: 'icon-192.png', size: 192, contentScale: 0.78 },
  { fileName: 'icon-512.png', size: 512, contentScale: 0.78 },
  { fileName: 'icon-maskable-192.png', size: 192, contentScale: 0.6 },
  { fileName: 'icon-maskable-512.png', size: 512, contentScale: 0.6 },
  { fileName: 'apple-touch-icon.png', size: 180, contentScale: 0.72 },
];

async function generateIcon(spec: IconSpec): Promise<void> {
  const logoSize = Math.round(spec.size * spec.contentScale);

  // Render the SVG mark to a transparent raster at the target inner size, then
  // place it centered over a solid white square canvas.
  const logo = await sharp(SOURCE_LOGO)
    .resize(logoSize, logoSize, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer();

  const outputPath = path.join(OUTPUT_DIR, spec.fileName);

  await sharp({
    create: {
      width: spec.size,
      height: spec.size,
      channels: 4,
      background: BACKGROUND,
    },
  })
    .composite([{ input: logo, gravity: 'center' }])
    .png()
    .toFile(outputPath);

  console.info(`✓ ${spec.fileName} (${spec.size}×${spec.size})`);
}

async function main(): Promise<void> {
  await mkdir(OUTPUT_DIR, { recursive: true });
  await Promise.all(ICON_SPECS.map(generateIcon));
  console.info(`\nGenerated ${ICON_SPECS.length} icons in public/icons/`);
}

main().catch((error: unknown) => {
  console.error('Failed to generate PWA icons:', error);
  process.exit(1);
});
