/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

// Bundles the handler for the container image. Run from this project's
// directory (`pnpm run build`) before `sam build` or `docker build`: the image
// is built from `dist/` and never sees `src/` or `../packages/job-contract`.

import { cpSync, readFileSync, rmSync, writeFileSync } from 'node:fs';

import { build } from 'esbuild';

// One CommonJS file with the wire contract, zod and the S3 client inlined.
// `sharp` stays external: it loads a native binary, which the image installs
// for its own platform.
await build({
  entryPoints: ['src/handler.ts'],
  outfile: 'dist/handler.cjs',
  bundle: true,
  platform: 'node',
  target: 'node24',
  format: 'cjs',
  external: ['sharp'],
  legalComments: 'none',
  logLevel: 'info',
});

// The image installs `sharp` with pnpm from this project's lockfile. Hand it
// the pnpm version mise.toml pins, so the toolchain keeps one source of truth.
const pnpmPin = /^pnpm = "(.+)"$/m.exec(readFileSync('../mise.toml', 'utf8'))?.at(1);
if (!pnpmPin) {
  throw new Error('mise.toml does not pin a pnpm version');
}
writeFileSync('dist/pnpm-version', `${pnpmPin}\n`);

// pnpm reads every `file:` dependency the lockfile names before it installs
// anything, even one `--prod` then leaves out. The image's build context is
// this directory, so the wire contract is copied to where the image can put it
// back at `../packages/job-contract`. None of it reaches the final image.
rmSync('dist/job-contract', { recursive: true, force: true });
cpSync('../packages/job-contract', 'dist/job-contract', { recursive: true });
