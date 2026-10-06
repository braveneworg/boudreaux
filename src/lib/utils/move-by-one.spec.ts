/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { moveByOne } from './move-by-one';

describe('moveByOne', () => {
  const items = ['a', 'b', 'c'];

  it('moves an item one step earlier', () => {
    expect(moveByOne(items, 2, -1)).toEqual(['a', 'c', 'b']);
  });

  it('moves an item one step later', () => {
    expect(moveByOne(items, 0, 1)).toEqual(['b', 'a', 'c']);
  });

  it('is null at the start when moving earlier', () => {
    expect(moveByOne(items, 0, -1)).toBeNull();
  });

  it('is null at the end when moving later', () => {
    expect(moveByOne(items, 2, 1)).toBeNull();
  });

  it('leaves the input untouched', () => {
    moveByOne(items, 1, 1);

    expect(items).toEqual(['a', 'b', 'c']);
  });

  it('works for any item type', () => {
    expect(moveByOne([{ id: 1 }, { id: 2 }], 1, -1)).toEqual([{ id: 2 }, { id: 1 }]);
  });
});
