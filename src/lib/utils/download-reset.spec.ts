/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { computeResetInHours } from './download-reset';

vi.mock('@/lib/constants', () => ({
  DOWNLOAD_RESET_HOURS: 6,
}));

describe('computeResetInHours', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-04-04T12:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns null when lastDownloadedAt is null', () => {
    expect(computeResetInHours(null)).toBeNull();
  });

  it('returns null when the reset window has fully elapsed (> 6 hours ago)', () => {
    const sevenHoursAgo = new Date('2026-04-04T05:00:00Z');
    expect(computeResetInHours(sevenHoursAgo)).toBeNull();
  });

  it('returns null when exactly at the 6-hour boundary', () => {
    const exactlySixHoursAgo = new Date('2026-04-04T06:00:00Z');
    expect(computeResetInHours(exactlySixHoursAgo)).toBeNull();
  });

  it('returns 4 when downloaded 2 hours ago', () => {
    const twoHoursAgo = new Date('2026-04-04T10:00:00Z');
    expect(computeResetInHours(twoHoursAgo)).toBe(4);
  });

  it('returns 1 when less than 1 hour remains (minimum clamp)', () => {
    const fiveAndAHalfHoursAgo = new Date('2026-04-04T06:28:00Z');
    expect(computeResetInHours(fiveAndAHalfHoursAgo)).toBe(1);
  });

  it('returns 6 when just downloaded (maximum clamp)', () => {
    const justNow = new Date('2026-04-04T12:00:00Z');
    expect(computeResetInHours(justNow)).toBe(6);
  });

  it('accepts a string date in addition to a Date object', () => {
    const twoHoursAgo = '2026-04-04T10:00:00Z';
    expect(computeResetInHours(twoHoursAgo)).toBe(4);
  });

  it('returns ceil of remaining hours (not floor)', () => {
    // 1.5 hours remaining → Math.ceil(1.5) = 2
    const fourAndAHalfHoursAgo = new Date('2026-04-04T07:30:00Z');
    expect(computeResetInHours(fourAndAHalfHoursAgo)).toBe(2);
  });
});
