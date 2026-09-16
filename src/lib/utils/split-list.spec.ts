/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { splitList } from './split-list';

describe('splitList', () => {
  it('splits a comma-separated list and trims each item', () => {
    expect(splitList(' hip-hop , soul ,jazz')).toEqual(['hip-hop', 'soul', 'jazz']);
  });

  it('drops empty items', () => {
    expect(splitList('rock,,, ,punk')).toEqual(['rock', 'punk']);
  });

  it('returns an empty list for null', () => {
    expect(splitList(null)).toEqual([]);
  });

  it('returns an empty list for undefined', () => {
    expect(splitList(undefined)).toEqual([]);
  });

  it('returns an empty list for an empty string', () => {
    expect(splitList('')).toEqual([]);
  });
});
