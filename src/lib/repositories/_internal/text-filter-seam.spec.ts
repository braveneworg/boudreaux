/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { lineOf, repositorySources } from '@/test-utils/repository-sources';

// On MongoDB, Prisma sends `contains`, `startsWith`, `endsWith`, and any
// filter with `mode: 'insensitive'`, to the database as a regular expression
// and does not escape the value
// (docs/lessons/prisma-mongo/a-text-filter-is-a-regex.md). The where
// kit's text helpers escape it. This spec is the seam: a text filter written
// by hand in any repository fails here, so a new search cannot bring the
// defect back. Only repositories may import Prisma, so they are the whole
// of what there is to scan.

/** The one module allowed to write these shapes: it is where the value is escaped. */
const WHERE_KIT = '/_internal/where-kit.ts';

/** A Prisma text operator written as an object key, or the case-insensitive mode. */
const HAND_WRITTEN_TEXT_FILTER = /\b(?:contains|startsWith|endsWith)\s*:|mode:\s*'insensitive'/g;

/** Each hand-written text filter in a source, as `line: text`. */
const handWritten = (source: string): string[] =>
  [...source.matchAll(HAND_WRITTEN_TEXT_FILTER)].map(
    (match) => `${lineOf(source, match.index)}: ${match[0]}`
  );

describe('the text filter seam', () => {
  it('flags each text operator and the insensitive mode, and nothing built from the kit', () => {
    expect(
      handWritten(
        [
          'a: { title: containsText(term) }',
          "b: { title: { contains: term, mode: 'insensitive' } }",
          'c: { key: { startsWith: prefix } }',
          'd: { name: { endsWith : suffix } }',
          "e: { name: { equals: name, mode: 'insensitive' } }",
          'f: { name: { equals: name } }',
          'g: { username: startsWithText(prefix) }',
        ].join('\n')
      )
    ).toEqual([
      '2: contains:',
      "2: mode: 'insensitive'",
      '3: startsWith:',
      '4: endsWith :',
      "5: mode: 'insensitive'",
    ]);
  });

  it('scans the where kit’s neighbours, so the scan is looking at the right tree', () => {
    const paths = repositorySources().map(({ path }) => path);

    expect(paths).toContain(WHERE_KIT);
    expect(paths).toContain('/video-repository.ts');
  });

  it('leaves no text filter written by hand in any repository', () => {
    const offenders = repositorySources()
      .filter(({ path }) => path !== WHERE_KIT)
      .flatMap(({ path, source }) => handWritten(source).map((hit) => `${path}:${hit}`));

    expect(offenders).toEqual([]);
  });
});
