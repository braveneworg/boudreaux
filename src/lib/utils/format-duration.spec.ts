/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { formatDuration } from './format-duration';

describe('formatDuration', () => {
  it('formats zero as 0:00', () => {
    expect(formatDuration(0)).toBe('0:00');
  });

  it('zero-pads single-digit seconds', () => {
    expect(formatDuration(5)).toBe('0:05');
  });

  it('formats minutes and seconds', () => {
    expect(formatDuration(90)).toBe('1:30');
  });

  it('zero-pads seconds within a minute', () => {
    expect(formatDuration(65)).toBe('1:05');
  });

  it('switches to h:mm:ss at exactly one hour', () => {
    expect(formatDuration(3600)).toBe('1:00:00');
  });

  it('formats hours, minutes, and seconds', () => {
    expect(formatDuration(3661)).toBe('1:01:01');
  });

  it('floors fractional seconds', () => {
    expect(formatDuration(59.9)).toBe('0:59');
  });

  it('returns a dash for null', () => {
    expect(formatDuration(null)).toBe('-');
  });

  it('returns a dash for undefined', () => {
    expect(formatDuration(undefined)).toBe('-');
  });

  it('returns a dash for negative input', () => {
    expect(formatDuration(-5)).toBe('-');
  });

  it('returns a dash for a non-finite number', () => {
    expect(formatDuration(Number.NaN)).toBe('-');
  });
});
