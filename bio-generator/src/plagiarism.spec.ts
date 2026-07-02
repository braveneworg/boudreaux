/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { findPlagiarizedSegments } from './plagiarism.js';

const SOURCE =
  'Ceschi Ramos is an American rapper and singer from New Haven Connecticut who co-founded the label Fake Four Inc with his brother David Ramos in 2008';

describe('findPlagiarizedSegments', () => {
  it('returns empty when output shares no 8-word run with sources', () => {
    expect(
      findPlagiarizedSegments('<p>A wholly original sentence about music.</p>', [SOURCE])
    ).toEqual([]);
  });

  it('flags a copied run and merges overlapping shingles into one segment', () => {
    const output = `<p>He is <strong>an American rapper and singer from New Haven Connecticut who co-founded</strong> things.</p>`;
    const segments = findPlagiarizedSegments(output, [SOURCE]);
    expect(segments).toHaveLength(1);
    expect(segments[0].text).toBe(
      'is an american rapper and singer from new haven connecticut who co founded'
    );
  });

  it('ignores markup, case, and punctuation when matching', () => {
    const output =
      '<p>An AMERICAN rapper, and singer — from New Haven, Connecticut who co-founded!</p>';
    expect(findPlagiarizedSegments(output, [SOURCE])).toHaveLength(1);
  });

  it('returns empty when sources are empty', () => {
    expect(findPlagiarizedSegments('anything at all here now and then some more', [])).toEqual([]);
  });
});
