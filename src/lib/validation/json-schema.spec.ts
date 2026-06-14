/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { jsonValueSchema } from './json-schema';

describe('jsonValueSchema', () => {
  it('accepts a string primitive', () => {
    expect(jsonValueSchema.parse('hello')).toBe('hello');
  });

  it('accepts a number primitive', () => {
    expect(jsonValueSchema.parse(42)).toBe(42);
  });

  it('accepts a boolean primitive', () => {
    expect(jsonValueSchema.parse(true)).toBe(true);
  });

  it('accepts null', () => {
    expect(jsonValueSchema.parse(null)).toBeNull();
  });

  it('accepts an array of mixed JSON values', () => {
    expect(jsonValueSchema.parse([1, 'two', false, null])).toEqual([1, 'two', false, null]);
  });

  it('accepts a nested object exercising every union member', () => {
    const value = {
      str: 'a',
      num: 1,
      bool: false,
      nil: null,
      arr: [1, 'x', true, null, { deep: 'y' }],
      obj: { nested: ['z'] },
    };

    expect(jsonValueSchema.parse(value)).toEqual(value);
  });

  it('rejects undefined (not a JSON value)', () => {
    expect(() => jsonValueSchema.parse(undefined)).toThrow();
  });

  it('rejects a bigint (not a JSON value)', () => {
    expect(() => jsonValueSchema.parse(10n)).toThrow();
  });
});
