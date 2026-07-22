/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * `@fakefour/job-contract` — the single source of truth for wire shapes shared
 * between the web app and the async-job Lambdas (bio-generator, video
 * enrichment). Raw TypeScript, no build step: consumers resolve `./src/index.ts`
 * directly (web via `transpilePackages`, Lambda via `sam build`'s esbuild).
 */
// Extensionless relative import: the package is always bundled (Next webpack via
// transpilePackages, the Lambda via sam/esbuild), and webpack resolves `.ts`
// here but not a literal `.js` that has no on-disk counterpart. tsc (bundler),
// esbuild, and vitest all resolve extensionless too.
export {
  BIO_PROGRESS_STAGES,
  bioProgressPostSchema,
  type BioProgressStage,
  type BioProgressPost,
} from './bio-progress';
