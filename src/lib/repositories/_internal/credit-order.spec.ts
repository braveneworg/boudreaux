/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { creditOrderBy, orderedCredits } from './credit-order';

const REPOSITORIES_DIR = join(__dirname, '..');

/** Every non-spec TypeScript source under `src/lib/repositories`, recursively. */
const repositorySources = (dir: string): string[] =>
  // eslint-disable-next-line security/detect-non-literal-fs-filename -- scanning this repo's own sources
  readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return repositorySources(path);
    return entry.name.endsWith('.ts') && !entry.name.includes('.spec.') ? [path] : [];
  });

// A relation filter (`some` / `none` / `every`) is not a load and needs no
// order; a bare identifier is allowed only when this file declares it as
// `orderedCredits(...)`; anything else after `artistReleases:` loads credit
// rows unordered.
const CREDIT_LOAD =
  /artistReleases:\s*(orderedCredits\(|\{\s*(?:some|none|every)\b|[A-Za-z_$][\w$]*\b|.)/g;
const ORDERED_CONST = /const\s+([A-Za-z_$][\w$]*)\s*=\s*orderedCredits\(/g;

const unorderedLoads = (source: string): number[] => {
  const ordered = new Set([...source.matchAll(ORDERED_CONST)].map(([, name]) => name));
  return [...source.matchAll(CREDIT_LOAD)]
    .filter(([, next]) => {
      if (next === 'orderedCredits(' || /^\{\s*(?:some|none|every)\b/.test(next)) return false;
      return !ordered.has(next);
    })
    .map((match) => source.slice(0, match.index).split('\n').length);
};

describe('orderedCredits', () => {
  it('flags a load that is not built from orderedCredits', () => {
    expect(
      unorderedLoads(
        [
          'const credits = orderedCredits({ select: { artistId: true } });',
          'a: { artistReleases: credits }',
          'b: { artistReleases: orderedCredits({ include: { artist: true } }) }',
          'c: { artistReleases: { some: { artistId } } }',
          'd: { artistReleases: {\n  some: { artistId } } }',
          'e: { artistReleases: { include: { artist: true } } }',
          'f: { artistReleases: true }',
          'g: { artistReleases: other }',
        ].join('\n')
      )
    ).toEqual([7, 8, 9]);
  });

  it('adds the credit order to any projection', () => {
    expect(orderedCredits({ select: { artistId: true } })).toEqual({
      select: { artistId: true },
      orderBy: creditOrderBy,
    });
  });

  it('is the only way a repository loads artistReleases', () => {
    const unordered = repositorySources(REPOSITORIES_DIR).flatMap((path) =>
      // eslint-disable-next-line security/detect-non-literal-fs-filename -- scanning this repo's own sources
      unorderedLoads(readFileSync(path, 'utf8')).map(
        (line) => `${path.replace(REPOSITORIES_DIR, '')}:${line}`
      )
    );

    expect(unordered).toEqual([]);
  });
});
