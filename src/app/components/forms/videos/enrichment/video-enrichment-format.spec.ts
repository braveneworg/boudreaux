/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { formatBitrate, formatFrameRate, formatResolution } from './video-enrichment-format';

describe('formatResolution', () => {
  it('joins width and height with a multiplication sign', () => {
    expect(formatResolution(1920, 1080)).toBe('1920×1080');
  });

  it('returns null when the width is missing', () => {
    expect(formatResolution(null, 1080)).toBeNull();
  });

  it('returns null when the height is missing', () => {
    expect(formatResolution(1920, undefined)).toBeNull();
  });
});

describe('formatBitrate', () => {
  it('promotes 1000+ kbps to one-decimal Mbps', () => {
    expect(formatBitrate(4200)).toBe('4.2 Mbps');
  });

  it('keeps sub-Mbps rates in kbps', () => {
    expect(formatBitrate(320)).toBe('320 kbps');
  });

  it('formats an exact Mbps boundary', () => {
    expect(formatBitrate(1000)).toBe('1.0 Mbps');
  });

  it('returns null for a missing rate', () => {
    expect(formatBitrate(null)).toBeNull();
  });
});

describe('formatFrameRate', () => {
  it('renders a fractional rate to at most two decimals', () => {
    expect(formatFrameRate(29.97)).toBe('29.97 fps');
  });

  it('drops trailing zeros on integer rates', () => {
    expect(formatFrameRate(30)).toBe('30 fps');
  });

  it('rounds long fractions to two decimals', () => {
    expect(formatFrameRate(23.976)).toBe('23.98 fps');
  });

  it('returns null for a missing rate', () => {
    expect(formatFrameRate(undefined)).toBeNull();
  });
});
