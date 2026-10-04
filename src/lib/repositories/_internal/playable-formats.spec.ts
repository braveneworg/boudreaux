/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { lineOf, repositorySources } from '@/test-utils/repository-sources';

import { digitalFormatWhere } from './digital-format-where';
import { playableFormats, playableFormatWhere } from './playable-formats';

/**
 * Reads that load EVERY format of a release, and why each may. Anything
 * else that loads `digitalFormats` must be built from `playableFormats`. A
 * new full load fails this spec until it is listed here with its reason —
 * the moment to ask whether the payload can reach a public surface.
 */
const NON_PUBLIC_FORMAT_LOADS: Readonly<Record<string, { count: number; reason: string }>> = {
  '/release-repository.ts': {
    count: 3,
    reason: 'admin detail, admin create/soft-delete/restore, and the S3 cleanup before a delete',
  },
  '/purchase-repository.ts': {
    count: 1,
    reason: "the signed-in buyer's own collection, whose downloads go through the download gate",
  },
};

// A relation filter (`some` / `none` / `every`) is not a load; a bare
// identifier is a load built from `playableFormats` only when the same file
// declares it so; anything else after `digitalFormats:` loads every format.
const FORMAT_LOAD =
  /digitalFormats:\s*(playableFormats\(|\{\s*(?:some|none|every)\b|[A-Za-z_$][\w$]*\b|.)/g;
const PLAYABLE_CONST = /const\s+([A-Za-z_$][\w$]*)\s*=\s*playableFormats\(/g;

const fullFormatLoads = (source: string): number[] => {
  const playable = new Set([...source.matchAll(PLAYABLE_CONST)].map(([, name]) => name));
  return [...source.matchAll(FORMAT_LOAD)]
    .filter(([, next]) => {
      if (next === 'playableFormats(' || /^\{\s*(?:some|none|every)\b/.test(next)) return false;
      return !playable.has(next);
    })
    .map((match) => lineOf(source, match.index));
};

describe('playableFormats', () => {
  it('limits any projection to the active playable format', () => {
    expect(playableFormats({ select: { id: true } })).toEqual({
      select: { id: true },
      where: playableFormatWhere,
    });
  });

  it('is the playable type AND not withdrawn', () => {
    expect(playableFormatWhere).toEqual({
      AND: [{ formatType: 'MP3_320KBPS' }, digitalFormatWhere.active],
    });
  });

  it('flags a load that is not built from playableFormats', () => {
    expect(
      fullFormatLoads(
        [
          'const formats = playableFormats({ select: { id: true } });',
          'a: { digitalFormats: formats }',
          'b: { digitalFormats: playableFormats({ include: { files: true } }) }',
          'c: { digitalFormats: { some: { formatType } } }',
          'd: { digitalFormats: {\n  none: {} } }',
          'e: { digitalFormats: { include: { files: true } } }',
          'f: { digitalFormats: true }',
          'g: { digitalFormats: other }',
        ].join('\n')
      )
    ).toEqual([7, 8, 9]);
  });

  it('is how every public read loads formats; full loads are only the listed ones', () => {
    const fullLoads = Object.fromEntries(
      repositorySources()
        .map(({ path, source }) => [path, fullFormatLoads(source).length] as const)
        .filter(([, count]) => count > 0)
    );

    expect(fullLoads).toEqual(
      Object.fromEntries(
        Object.entries(NON_PUBLIC_FORMAT_LOADS).map(([path, { count }]) => [path, count])
      )
    );
  });
});
