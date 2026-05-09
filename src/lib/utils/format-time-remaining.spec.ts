/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { formatTimeRemaining } from '@/lib/utils/format-time-remaining';

describe('formatTimeRemaining', () => {
  it('renders "Hh Mm" when at least 1 hour remains', () => {
    expect(formatTimeRemaining(23 * 3600_000 + 14 * 60_000)).toBe('23h 14m');
    expect(formatTimeRemaining(1 * 3600_000)).toBe('1h 0m');
    expect(formatTimeRemaining(2 * 3600_000 + 5 * 60_000 + 59_000)).toBe('2h 5m');
  });

  it('renders "Mm" when between 1 minute and 1 hour remains', () => {
    expect(formatTimeRemaining(47 * 60_000)).toBe('47m');
    expect(formatTimeRemaining(60_000)).toBe('1m');
    expect(formatTimeRemaining(59 * 60_000 + 59_000)).toBe('59m');
  });

  it('renders "Ss" for sub-minute values', () => {
    expect(formatTimeRemaining(32_000)).toBe('32s');
    expect(formatTimeRemaining(1_000)).toBe('1s');
    expect(formatTimeRemaining(59_000)).toBe('59s');
  });

  it('clamps zero and negative deltas to "0s"', () => {
    expect(formatTimeRemaining(0)).toBe('0s');
    expect(formatTimeRemaining(-1)).toBe('0s');
    expect(formatTimeRemaining(-3600_000)).toBe('0s');
  });

  it('returns "0s" for non-finite values', () => {
    expect(formatTimeRemaining(Number.NaN)).toBe('0s');
    expect(formatTimeRemaining(Number.POSITIVE_INFINITY)).toBe('0s');
    expect(formatTimeRemaining(Number.NEGATIVE_INFINITY)).toBe('0s');
  });

  it('switches units at the 1 hour boundary', () => {
    expect(formatTimeRemaining(3_600_000 - 1)).toBe('59m');
    expect(formatTimeRemaining(3_600_000)).toBe('1h 0m');
  });

  it('switches units at the 1 minute boundary', () => {
    expect(formatTimeRemaining(60_000 - 1)).toBe('59s');
    expect(formatTimeRemaining(60_000)).toBe('1m');
  });
});
