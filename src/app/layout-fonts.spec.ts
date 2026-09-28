/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

const LAYOUT_PATH = path.join(import.meta.dirname, 'layout.tsx');
const UPRIGHT_FONT_PATH = path.join(import.meta.dirname, 'fonts/jost-latin-wght-normal.woff2');
const ITALIC_FONT_PATH = path.join(import.meta.dirname, 'fonts/jost-latin-wght-italic.woff2');
const LICENSE_PATH = path.join(import.meta.dirname, 'fonts/Jost-LICENSE.txt');

const LAYOUT_SOURCE = readFileSync(LAYOUT_PATH, 'utf8');

/** Every `./fonts/…` path the layout hands to the font loader. */
const FONT_PATHS = [...LAYOUT_SOURCE.matchAll(/path:\s*'(\.\/fonts\/[^']+)'/g)].map(
  ([, fontPath]) => fontPath
);

// The Google font loader downloads the font from Google while the app builds.
// On 2026-09-27 that download failed on main, the build died, and the deploy
// of an already-merged fix was skipped. The font ships in the repo instead,
// so a build needs no network.
describe('layout fonts', () => {
  it('never imports the loader that fetches fonts from Google at build time', () => {
    expect(LAYOUT_SOURCE).not.toMatch(/from\s+'next\/font\/google'/);
  });

  it('loads Jost upright and italic from files in the repo', () => {
    expect(FONT_PATHS).toEqual([
      './fonts/jost-latin-wght-normal.woff2',
      './fonts/jost-latin-wght-italic.woff2',
    ]);
  });

  it('ships the upright font file', () => {
    expect(existsSync(UPRIGHT_FONT_PATH)).toBe(true);
  });

  it('ships the italic font file', () => {
    expect(existsSync(ITALIC_FONT_PATH)).toBe(true);
  });

  it('ships the font licence beside the files it covers', () => {
    expect(existsSync(LICENSE_PATH)).toBe(true);
  });
});
