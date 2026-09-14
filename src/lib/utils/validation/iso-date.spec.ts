/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import {
  ISO_DATE_PATTERN,
  isRealCalendarDate,
  isTodayUtc,
  todayUtcIsoDate,
  toIsoDay,
} from './iso-date';

describe('ISO_DATE_PATTERN', () => {
  it('matches a YYYY-MM-DD day', () => {
    expect(ISO_DATE_PATTERN.test('2021-04-09')).toBe(true);
  });

  it('rejects an unpadded day', () => {
    expect(ISO_DATE_PATTERN.test('2021-4-9')).toBe(false);
  });

  it('rejects an ISO datetime', () => {
    expect(ISO_DATE_PATTERN.test('2021-04-09T00:00:00.000Z')).toBe(false);
  });

  it('rejects a slash-formatted date', () => {
    expect(ISO_DATE_PATTERN.test('06/01/2020')).toBe(false);
  });
});

describe('isRealCalendarDate', () => {
  it('accepts a real day', () => {
    expect(isRealCalendarDate('2021-04-09')).toBe(true);
  });

  it('accepts a leap day in a leap year', () => {
    expect(isRealCalendarDate('2020-02-29')).toBe(true);
  });

  it('rejects a day that overflows its month', () => {
    expect(isRealCalendarDate('2021-02-30')).toBe(false);
  });

  it('rejects a leap day in a non-leap year', () => {
    expect(isRealCalendarDate('2021-02-29')).toBe(false);
  });

  it('rejects an impossible month', () => {
    expect(isRealCalendarDate('2020-13-01')).toBe(false);
  });

  it('rejects a value that is not YYYY-MM-DD', () => {
    expect(isRealCalendarDate('06/01/2020')).toBe(false);
  });
});

describe('toIsoDay', () => {
  it('passes a YYYY-MM-DD day through unchanged', () => {
    expect(toIsoDay('2020-06-01')).toBe('2020-06-01');
  });

  it('returns null for an empty string', () => {
    expect(toIsoDay('')).toBeNull();
  });

  it('returns null for null', () => {
    expect(toIsoDay(null)).toBeNull();
  });

  it('returns null for undefined', () => {
    expect(toIsoDay(undefined)).toBeNull();
  });

  it('returns null for an unparseable value', () => {
    expect(toIsoDay('not-a-date')).toBeNull();
  });

  // The DatePicker commits `date.toISOString()` for a Date built at LOCAL
  // midnight, so the day the admin picked is the local day — never the UTC day,
  // which can be the previous one east of Greenwich.
  it('collapses a local-midnight ISO datetime to the local day', () => {
    const localMidnight = new Date(2020, 5, 1, 0, 0, 0);

    expect(toIsoDay(localMidnight.toISOString())).toBe('2020-06-01');
  });

  it('collapses a late-evening local ISO datetime to the same local day', () => {
    const lateEvening = new Date(2020, 5, 1, 23, 30, 0);

    expect(toIsoDay(lateEvening.toISOString())).toBe('2020-06-01');
  });
});

describe('todayUtcIsoDate', () => {
  it('formats the injected instant as its UTC day', () => {
    expect(todayUtcIsoDate(new Date('2026-09-14T23:59:59.999Z'))).toBe('2026-09-14');
  });

  it('uses the UTC day, not the local one, right after UTC midnight', () => {
    expect(todayUtcIsoDate(new Date('2026-09-15T00:00:00.000Z'))).toBe('2026-09-15');
  });
});

describe('isTodayUtc', () => {
  it('is true for the UTC day of the injected instant', () => {
    expect(isTodayUtc('2026-09-14', new Date('2026-09-14T00:00:00.000Z'))).toBe(true);
  });

  it('is false for yesterday', () => {
    expect(isTodayUtc('2026-09-13', new Date('2026-09-14T00:00:00.000Z'))).toBe(false);
  });

  it('is false one millisecond before UTC midnight flips the day', () => {
    expect(isTodayUtc('2026-09-14', new Date('2026-09-13T23:59:59.999Z'))).toBe(false);
  });

  it('is false for a value that is not a YYYY-MM-DD day', () => {
    expect(isTodayUtc('2026-09-14T00:00:00.000Z', new Date('2026-09-14T12:00:00.000Z'))).toBe(
      false
    );
  });
});
