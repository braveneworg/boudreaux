/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { serializeForResponse } from './serialize-for-response';

describe('serializeForResponse', () => {
  it('converts BigInt values to Number', () => {
    const input = { fileSize: BigInt(1024), name: 'track.mp3' };

    expect(serializeForResponse(input)).toEqual({ fileSize: 1024, name: 'track.mp3' });
  });

  it('converts nested BigInt values', () => {
    const input = { files: [{ size: BigInt(2048) }], meta: { total: BigInt(2048) } };

    expect(serializeForResponse(input)).toEqual({
      files: [{ size: 2048 }],
      meta: { total: 2048 },
    });
  });

  it('passes through payloads without BigInt unchanged', () => {
    const input = { id: 'abc', count: 3, tags: ['a', 'b'], active: true };

    expect(serializeForResponse(input)).toEqual(input);
  });
});
