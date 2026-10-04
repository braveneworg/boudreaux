/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

/** `src/lib/repositories`, the only layer that loads relations from Prisma. */
export const REPOSITORIES_DIR = join(__dirname, '..', 'lib', 'repositories');

/** One repository source file: its path relative to the repositories directory, and its text. */
export interface RepositorySource {
  path: string;
  source: string;
}

const sourcePaths = (dir: string): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return sourcePaths(path);
    return entry.name.endsWith('.ts') && !entry.name.includes('.spec.') ? [path] : [];
  });

/**
 * Every non-spec TypeScript source under `src/lib/repositories`, recursively,
 * for specs that scan the repositories for a load written outside the seam
 * every such load must be built from (`orderedCredits`, `playableFormats`).
 */
export const repositorySources = (): RepositorySource[] =>
  sourcePaths(REPOSITORIES_DIR).map((path) => ({
    path: path.replace(REPOSITORIES_DIR, ''),
    source: readFileSync(path, 'utf8'),
  }));

/** The 1-based line a match index falls on. */
export const lineOf = (source: string, index: number | undefined): number =>
  source.slice(0, index).split('\n').length;
