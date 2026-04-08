/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { isDarkColor } from './color';

describe('isDarkColor', () => {
  it('returns true for black (#000000)', () => {
    expect(isDarkColor('#000000')).toBe(true);
  });

  it('returns false for white (#ffffff)', () => {
    expect(isDarkColor('#ffffff')).toBe(false);
  });

  it('returns false for white shorthand (#fff)', () => {
    expect(isDarkColor('#fff')).toBe(false);
  });

  it('returns true for black shorthand (#000)', () => {
    expect(isDarkColor('#000')).toBe(true);
  });

  it('returns true for dark blue (#1a1a2e)', () => {
    expect(isDarkColor('#1a1a2e')).toBe(true);
  });

  it('returns false for light yellow (#ffff00)', () => {
    expect(isDarkColor('#ffff00')).toBe(false);
  });

  it('returns true for dark red (#8b0000)', () => {
    expect(isDarkColor('#8b0000')).toBe(true);
  });

  it('returns false for light gray (#cccccc)', () => {
    expect(isDarkColor('#cccccc')).toBe(false);
  });

  it('returns true for dark gray (#333333)', () => {
    expect(isDarkColor('#333333')).toBe(true);
  });

  it('returns true for null', () => {
    expect(isDarkColor(null)).toBe(true);
  });

  it('returns true for undefined', () => {
    expect(isDarkColor(undefined)).toBe(true);
  });

  it('returns true for empty string', () => {
    expect(isDarkColor('')).toBe(true);
  });

  it('returns true for invalid hex string', () => {
    expect(isDarkColor('#zzzzzz')).toBe(true);
  });

  it('returns true for hex with wrong length', () => {
    expect(isDarkColor('#abcd')).toBe(true);
  });

  it('handles uppercase hex', () => {
    expect(isDarkColor('#FFFFFF')).toBe(false);
    expect(isDarkColor('#000000')).toBe(true);
  });

  it('handles mixed case hex', () => {
    expect(isDarkColor('#FfFfFf')).toBe(false);
  });

  it('returns false for bright green (#00ff00)', () => {
    expect(isDarkColor('#00ff00')).toBe(false);
  });

  it('returns true for mid-dark threshold (#707070)', () => {
    // luminance = (0.299*112 + 0.587*112 + 0.114*112)/255 ≈ 0.439
    expect(isDarkColor('#707070')).toBe(true);
  });

  it('returns false for mid-light threshold (#909090)', () => {
    // luminance = (0.299*144 + 0.587*144 + 0.114*144)/255 ≈ 0.565
    expect(isDarkColor('#909090')).toBe(false);
  });
});
