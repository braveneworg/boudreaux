/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { formatDuration, formatDurationLong, formatVideoDuration } from './format-duration';

describe('formatVideoDuration', () => {
  it('formats zero as 0:00', () => {
    expect(formatVideoDuration(0)).toBe('0:00');
  });

  it('zero-pads single-digit seconds', () => {
    expect(formatVideoDuration(5)).toBe('0:05');
  });

  it('formats minutes and seconds', () => {
    expect(formatVideoDuration(90)).toBe('1:30');
  });

  it('zero-pads seconds within a minute', () => {
    expect(formatVideoDuration(65)).toBe('1:05');
  });

  it('switches to h:mm:ss at exactly one hour', () => {
    expect(formatVideoDuration(3600)).toBe('1:00:00');
  });

  it('formats hours, minutes, and seconds', () => {
    expect(formatVideoDuration(3661)).toBe('1:01:01');
  });

  it('floors fractional seconds', () => {
    expect(formatVideoDuration(59.9)).toBe('0:59');
  });

  it('returns a dash for null', () => {
    expect(formatVideoDuration(null)).toBe('-');
  });

  it('returns a dash for undefined', () => {
    expect(formatVideoDuration(undefined)).toBe('-');
  });

  it('returns a dash for negative input', () => {
    expect(formatVideoDuration(-5)).toBe('-');
  });

  it('returns a dash for a non-finite number', () => {
    expect(formatVideoDuration(Number.NaN)).toBe('-');
  });
});

describe('formatDuration', () => {
  it('formats zero as 0:00', () => {
    expect(formatDuration(0)).toBe('0:00');
  });

  it('zero-pads seconds under a minute', () => {
    expect(formatDuration(59)).toBe('0:59');
  });

  it('formats minutes and seconds', () => {
    expect(formatDuration(61)).toBe('1:01');
  });

  it('formats whole minutes', () => {
    expect(formatDuration(600)).toBe('10:00');
  });

  it('formats just under an hour as m:ss', () => {
    expect(formatDuration(3599)).toBe('59:59');
  });

  it('never promotes to hours at exactly one hour', () => {
    expect(formatDuration(3600)).toBe('60:00');
  });

  it('keeps minutes past an hour as m:ss', () => {
    expect(formatDuration(4210)).toBe('70:10');
  });

  it('coerces null to 0:00', () => {
    expect(formatDuration(null)).toBe('0:00');
  });

  it('coerces undefined to 0:00', () => {
    expect(formatDuration(undefined)).toBe('0:00');
  });

  it('floors fractional seconds', () => {
    expect(formatDuration(59.9)).toBe('0:59');
  });

  it('passes negative input through raw arithmetic', () => {
    expect(formatDuration(-5)).toBe('-1:-5');
  });

  it('passes a negative minute-scale input through raw arithmetic', () => {
    expect(formatDuration(-65)).toBe('-2:-5');
  });

  it('passes NaN through unguarded', () => {
    expect(formatDuration(Number.NaN)).toBe('NaN:NaN');
  });
});

describe('formatDurationLong', () => {
  it('delegates zero to m:ss', () => {
    expect(formatDurationLong(0)).toBe('0:00');
  });

  it('formats just under an hour as m:ss', () => {
    expect(formatDurationLong(3599)).toBe('59:59');
  });

  it('switches to h:mm:ss at exactly one hour', () => {
    expect(formatDurationLong(3600)).toBe('1:00:00');
  });

  it('zero-pads minutes and seconds past an hour', () => {
    expect(formatDurationLong(3661)).toBe('1:01:01');
  });

  it('formats hours, minutes, and seconds', () => {
    expect(formatDurationLong(4210)).toBe('1:10:10');
  });
});
