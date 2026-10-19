/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { lineOf, repositorySources } from '@/test-utils/repository-sources';

import { listedRelease, publicArtist } from './visibility';

// A publication or deletion gate written by hand: a `{ not` or `{ isSet`
// clause on a field the visibility rules read, or a where-kit call naming one.
const HAND_WRITTEN_GATE =
  /(?:publishedOn|publishedAt|deletedOn)\s*:\s*\{\s*(?:not|isSet)\b|is(?:Present|Unset)(?:Or)?\(\s*'(?:publishedOn|publishedAt|deletedOn)'/g;

const handWrittenGates = (source: string): number[] =>
  [...source.matchAll(HAND_WRITTEN_GATE)].map((match) => lineOf(source, match.index));

describe('publicArtist', () => {
  const visible = { publishedOn: new Date('2024-01-01'), deletedOn: null };

  it('matches a published, non-deleted artist', () => {
    expect(publicArtist.matches(visible)).toBe(true);
  });

  it('accepts an ISO string publication date', () => {
    expect(publicArtist.matches({ ...visible, publishedOn: '2024-01-01T00:00:00.000Z' })).toBe(
      true
    );
  });

  it('treats an absent deletedOn (legacy document) as not deleted', () => {
    expect(publicArtist.matches({ publishedOn: new Date('2024-01-01') })).toBe(true);
  });

  // Whether an artist is still on the label decides nothing (ADR-0016). A
  // stored document may still carry the fields the rule once read.
  it.each([
    ['a departure date', { deactivatedAt: new Date('2025-03-01') }],
    ['the removed isActive flag set to false', { isActive: false }],
  ])('matches a published artist that carries %s', (_label, legacy) => {
    expect(publicArtist.matches({ ...visible, ...legacy })).toBe(true);
  });

  it.each([
    ['unpublished (null)', { ...visible, publishedOn: null }],
    ['unpublished (absent)', { deletedOn: null }],
    ['soft-deleted', { ...visible, deletedOn: new Date('2024-06-01') }],
    ['soft-deleted and unpublished', { publishedOn: null, deletedOn: new Date('2024-06-01') }],
  ])('does not match an artist that is %s', (_label, artist) => {
    expect(publicArtist.matches(artist)).toBe(false);
  });

  it('works unbound, as a filter callback', () => {
    const deleted = { ...visible, deletedOn: new Date('2024-06-01') };

    expect([visible, deleted].filter(publicArtist.matches)).toEqual([visible]);
  });

  // A `where` has room for one top-level `OR`, and it is the caller's.
  it('leaves the top-level OR of its where to the caller', () => {
    expect(publicArtist.where).not.toHaveProperty('OR');
  });
});

describe('listedRelease', () => {
  it('matches a published, non-deleted release', () => {
    expect(listedRelease.matches({ publishedAt: new Date('2024-01-01'), deletedOn: null })).toBe(
      true
    );
  });

  it('does not match an unpublished release', () => {
    expect(listedRelease.matches({ publishedAt: null, deletedOn: null })).toBe(false);
  });

  it('does not match a deleted release even when published', () => {
    expect(
      listedRelease.matches({
        publishedAt: new Date('2024-01-01'),
        deletedOn: new Date('2024-02-01'),
      })
    ).toBe(false);
  });

  it('treats a missing publishedAt field (legacy Mongo document) as unpublished', () => {
    expect(listedRelease.matches({ deletedOn: null })).toBe(false);
  });

  it('works unbound, as a filter callback', () => {
    const listed = { publishedAt: new Date('2024-01-01'), deletedOn: null };
    const draft = { publishedAt: null, deletedOn: null };

    expect([draft, listed].filter(listedRelease.matches)).toEqual([listed]);
  });

  it('leaves the top-level OR of its where to the caller', () => {
    expect(listedRelease.where).not.toHaveProperty('OR');
  });
});

describe('visibility rules in the repositories', () => {
  it('flags a publication or deletion gate written by hand, and nothing else', () => {
    expect(
      handWrittenGates(
        [
          'a: { publishedOn: { not: null } }',
          'b: { deletedOn: {\n  isSet: false } }',
          "c: { ...isPresent('publishedAt') }",
          "d: { ...isUnset('deletedOn') }",
          "e: { ...isUnsetOr('deletedOn', null) }",
          'f: { select: { publishedOn: true, deletedOn: true } }',
          "g: { ...isUnsetOr('genres', '') }",
          'h: { where: { slug, ...publicArtist.where } }',
          'i: { publishedAt: { lte: now } }',
        ].join('\n')
      )
    ).toEqual([1, 2, 4, 5, 6]);
  });

  it('are written by hand nowhere outside the fragment modules', () => {
    const handWritten = repositorySources()
      .filter(({ path }) => !path.startsWith('/_internal/'))
      .flatMap(({ path, source }) => handWrittenGates(source).map((line) => `${path}:${line}`));

    expect(handWritten).toEqual([]);
  });
});
