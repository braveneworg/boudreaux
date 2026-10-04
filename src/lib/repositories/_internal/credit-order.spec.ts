/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { lineOf, repositorySources } from '@/test-utils/repository-sources';

import { creditOrderBy, orderedCredits } from './credit-order';

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
    .map((match) => lineOf(source, match.index));
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
    const unordered = repositorySources().flatMap(({ path, source }) =>
      unorderedLoads(source).map((line) => `${path}:${line}`)
    );

    expect(unordered).toEqual([]);
  });
});
