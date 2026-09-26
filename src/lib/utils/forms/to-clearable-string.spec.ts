/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { toClearableString } from './to-clearable-string';

describe('toClearableString', () => {
  it('keeps an absent field absent', () => {
    expect(toClearableString(undefined)).toBeUndefined();
  });

  it('maps a submitted empty string to null', () => {
    expect(toClearableString('')).toBeNull();
  });

  it('maps a whitespace-only value to null', () => {
    expect(toClearableString('   \n\t')).toBeNull();
  });

  it('keeps null as null', () => {
    expect(toClearableString(null)).toBeNull();
  });

  it('returns a non-blank value unchanged, surrounding whitespace included', () => {
    expect(toClearableString(' Jr. ')).toBe(' Jr. ');
  });
});
