/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import {
  formatTourDate,
  formatTourTime,
  formatUTCOffset,
  getTimezoneOffsetMinutes,
  localToUTC,
  toLocalDateTimeString,
} from './timezone';

describe('timezone utilities', () => {
  // Fixed reference dates used throughout these tests:
  //   CDT  = America/Chicago in summer  → UTC-5  (-300 min)
  //   CST  = America/Chicago in winter  → UTC-6  (-360 min)
  //   IST  = Asia/Kolkata               → UTC+5:30 (+330 min)
  const summerDate = new Date('2025-07-04T12:00:00Z'); // Independence Day — CDT
  const winterDate = new Date('2025-01-15T12:00:00Z'); // January — CST
  const istDate = new Date('2025-06-01T00:00:00Z');

  // ─── getTimezoneOffsetMinutes ────────────────────────────────────────────────

  describe('getTimezoneOffsetMinutes', () => {
    it('returns 0 for UTC', () => {
      expect(getTimezoneOffsetMinutes('UTC', summerDate)).toBe(0);
    });

    it('returns -300 for America/Chicago in summer (CDT)', () => {
      expect(getTimezoneOffsetMinutes('America/Chicago', summerDate)).toBe(-300);
    });

    it('returns -360 for America/Chicago in winter (CST)', () => {
      expect(getTimezoneOffsetMinutes('America/Chicago', winterDate)).toBe(-360);
    });

    it('returns +330 for Asia/Kolkata (UTC+5:30)', () => {
      expect(getTimezoneOffsetMinutes('Asia/Kolkata', istDate)).toBe(330);
    });

    it('returns -240 for America/New_York in summer (EDT)', () => {
      expect(getTimezoneOffsetMinutes('America/New_York', summerDate)).toBe(-240);
    });

    it('defaults to now when no date is provided', () => {
      // Just verify the return value is a number.
      const result = getTimezoneOffsetMinutes('UTC');
      expect(typeof result).toBe('number');
    });
  });

  // ─── formatUTCOffset ────────────────────────────────────────────────────────

  describe('formatUTCOffset', () => {
    it('formats UTC as "UTC+00:00"', () => {
      expect(formatUTCOffset('UTC', summerDate)).toBe('UTC+00:00');
    });

    it('formats CDT (America/Chicago in summer) as "UTC-05:00"', () => {
      expect(formatUTCOffset('America/Chicago', summerDate)).toBe('UTC-05:00');
    });

    it('formats CST (America/Chicago in winter) as "UTC-06:00"', () => {
      expect(formatUTCOffset('America/Chicago', winterDate)).toBe('UTC-06:00');
    });

    it('formats Asia/Kolkata as "UTC+05:30"', () => {
      expect(formatUTCOffset('Asia/Kolkata', istDate)).toBe('UTC+05:30');
    });

    it('formats America/New_York in summer (EDT) as "UTC-04:00"', () => {
      expect(formatUTCOffset('America/New_York', summerDate)).toBe('UTC-04:00');
    });
  });

  // ─── localToUTC ─────────────────────────────────────────────────────────────

  describe('localToUTC', () => {
    it('converts 8 PM local Chicago CDT to 1 AM UTC next day', () => {
      // April 15 is in CDT (UTC-5): 20:00 CDT = 01:00 UTC+1 day
      const result = localToUTC('2025-04-15T20:00', 'America/Chicago');
      expect(result.toISOString()).toBe('2025-04-16T01:00:00.000Z');
    });

    it('converts 8 PM local Chicago CST to 2 AM UTC next day', () => {
      // January 15 is in CST (UTC-6): 20:00 CST = 02:00 UTC+1 day
      const result = localToUTC('2025-01-15T20:00', 'America/Chicago');
      expect(result.toISOString()).toBe('2025-01-16T02:00:00.000Z');
    });

    it('converts UTC noon to exactly noon UTC', () => {
      const result = localToUTC('2025-06-01T12:00', 'UTC');
      expect(result.toISOString()).toBe('2025-06-01T12:00:00.000Z');
    });

    it('converts IST midnight to the previous day 18:30 UTC', () => {
      // UTC+5:30 → midnight IST = 18:30 UTC previous day
      const result = localToUTC('2025-06-01T00:00', 'Asia/Kolkata');
      expect(result.toISOString()).toBe('2025-05-31T18:30:00.000Z');
    });

    it('handles the DST spring-forward boundary for America/New_York', () => {
      // US DST in 2025 begins March 9 at 2:00 AM → clocks spring to 3:00 AM (EST→EDT)
      // 3:00 AM EDT on March 9  = 07:00 UTC (EDT = UTC-4)
      const result = localToUTC('2025-03-09T03:00', 'America/New_York');
      expect(result.toISOString()).toBe('2025-03-09T07:00:00.000Z');
    });

    it('returns a Date object', () => {
      const result = localToUTC('2025-06-01T12:00', 'UTC');
      expect(result).toBeInstanceOf(Date);
    });
  });

  // ─── formatTourDate ─────────────────────────────────────────────────────────

  describe('formatTourDate', () => {
    const utcDate = new Date('2025-07-04T17:00:00Z'); // 5 PM UTC = noon CDT

    it('formats a date in a given timezone', () => {
      const result = formatTourDate(utcDate, 'America/Chicago');
      // noon CDT on July 4 is still July 4
      expect(result).toContain('Jul');
      expect(result).toContain('4');
      expect(result).toContain('2025');
    });

    it('accepts an ISO string as the date argument', () => {
      const result = formatTourDate('2025-07-04T17:00:00Z', 'America/Chicago');
      expect(result).toContain('2025');
    });

    it('prepends weekday when weekday option is provided', () => {
      const result = formatTourDate(utcDate, 'UTC', { weekday: 'long', month: 'long' });
      // July 4 2025 is a Friday
      expect(result.toLowerCase()).toContain('friday');
    });

    it('falls back to viewer locale when timeZone is null', () => {
      // Should not throw; result is a non-empty string
      const result = formatTourDate(utcDate, null);
      expect(typeof result).toBe('string');
      expect(result.length).toBeGreaterThan(0);
    });
  });

  // ─── formatTourTime ─────────────────────────────────────────────────────────

  describe('formatTourTime', () => {
    // 2025-04-15T01:00:00Z = 8:00 PM CDT in America/Chicago
    const utcDate = new Date('2025-04-15T01:00:00Z');

    it('formats stored UTC as local venue time', () => {
      const result = formatTourTime(utcDate, 'America/Chicago');
      expect(result).toBe('8:00 PM');
    });

    it('accepts an ISO string as the date argument', () => {
      const result = formatTourTime('2025-04-15T01:00:00Z', 'America/Chicago');
      expect(result).toBe('8:00 PM');
    });

    it('falls back gracefully when timeZone is null', () => {
      const result = formatTourTime(utcDate, null);
      expect(typeof result).toBe('string');
      expect(result.length).toBeGreaterThan(0);
    });

    it('includes timezone abbreviation when timeZoneName: "short" is passed', () => {
      const result = formatTourTime(utcDate, 'America/Chicago', { timeZoneName: 'short' });
      // CDT in April
      expect(result).toMatch(/CDT/);
    });
  });

  // ─── toLocalDateTimeString ───────────────────────────────────────────────────

  describe('toLocalDateTimeString', () => {
    it('round-trips with localToUTC for CDT (UTC-5)', () => {
      const local = '2025-04-15T20:00';
      const utc = localToUTC(local, 'America/Chicago');
      expect(toLocalDateTimeString(utc, 'America/Chicago')).toBe(local);
    });

    it('round-trips with localToUTC for CST (UTC-6)', () => {
      const local = '2025-01-15T20:00';
      const utc = localToUTC(local, 'America/Chicago');
      expect(toLocalDateTimeString(utc, 'America/Chicago')).toBe(local);
    });

    it('round-trips with localToUTC for IST (UTC+5:30)', () => {
      const local = '2025-06-01T08:30';
      const utc = localToUTC(local, 'Asia/Kolkata');
      expect(toLocalDateTimeString(utc, 'Asia/Kolkata')).toBe(local);
    });

    it('returns the same string for UTC when the date is already UTC', () => {
      const utcDate = new Date('2025-07-04T12:00:00Z');
      expect(toLocalDateTimeString(utcDate, 'UTC')).toBe('2025-07-04T12:00');
    });

    it('normalises midnight (hour "24") to "00"', () => {
      // 2025-07-05T00:00 IST = 2025-07-04T18:30 UTC
      const utcDate = new Date('2025-07-04T18:30:00Z');
      expect(toLocalDateTimeString(utcDate, 'Asia/Kolkata')).toBe('2025-07-05T00:00');
    });

    it('accepts an ISO string as the date argument', () => {
      const result = toLocalDateTimeString('2025-04-15T01:00:00Z', 'America/Chicago');
      expect(result).toBe('2025-04-14T20:00');
    });
  });
});
