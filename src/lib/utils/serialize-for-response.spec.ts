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

  it('converts negative in-range BigInt values to Number', () => {
    expect(serializeForResponse({ delta: BigInt(-2048) })).toEqual({ delta: -2048 });
  });

  it('emits BigInt values beyond MAX_SAFE_INTEGER as a decimal string to avoid precision loss', () => {
    const huge = BigInt(Number.MAX_SAFE_INTEGER) + 10n;

    expect(serializeForResponse({ size: huge })).toEqual({ size: huge.toString() });
  });

  it('emits BigInt values below MIN_SAFE_INTEGER as a decimal string', () => {
    const tiny = BigInt(Number.MIN_SAFE_INTEGER) - 10n;

    expect(serializeForResponse({ size: tiny })).toEqual({ size: tiny.toString() });
  });

  it('preserves Date instances instead of stringifying them', () => {
    const createdAt = new Date('2026-01-01T00:00:00.000Z');

    const result = serializeForResponse({ createdAt });

    expect(result.createdAt).toBe(createdAt);
  });

  it('preserves null and primitive top-level values', () => {
    expect(serializeForResponse(null)).toBeNull();
    expect(serializeForResponse(BigInt(7))).toBe(7);
  });
});
