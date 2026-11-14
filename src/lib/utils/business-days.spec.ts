/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { businessDaysBefore, isBusinessDay, utcDay } from './business-days';

// 2026-11-09 is a Monday.
const at = (day: string, time = '15:30:00.000'): Date => new Date(`${day}T${time}Z`);

describe('isBusinessDay', () => {
  it.each([
    ['Monday', '2026-11-09'],
    ['Friday', '2026-11-13'],
  ])('counts %s', (_name, day) => {
    expect(isBusinessDay(at(day))).toBe(true);
  });

  it.each([
    ['Saturday', '2026-11-14'],
    ['Sunday', '2026-11-15'],
  ])('does not count %s', (_name, day) => {
    expect(isBusinessDay(at(day))).toBe(false);
  });

  it('reads the day in UTC, whatever the hour', () => {
    expect(isBusinessDay(at('2026-11-13', '23:59:59.999'))).toBe(true);
    expect(isBusinessDay(at('2026-11-14', '00:00:00.000'))).toBe(false);
  });
});

describe('businessDaysBefore', () => {
  it('is the same moment for zero days', () => {
    expect(businessDaysBefore(at('2026-11-11'), 0)).toEqual(at('2026-11-11'));
  });

  it('steps back one weekday within a week', () => {
    expect(businessDaysBefore(at('2026-11-11'), 1)).toEqual(at('2026-11-10'));
  });

  it('steps over a weekend', () => {
    // Monday, one business day back, is the Friday before.
    expect(businessDaysBefore(at('2026-11-09'), 1)).toEqual(at('2026-11-06'));
  });

  it('puts five business days before a Wednesday on the Wednesday before', () => {
    expect(businessDaysBefore(at('2026-11-11'), 5)).toEqual(at('2026-11-04'));
  });

  it('counts back from a Saturday as from the weekend it is in', () => {
    // Saturday, one business day back, is Friday.
    expect(businessDaysBefore(at('2026-11-14'), 1)).toEqual(at('2026-11-13'));
  });

  it('keeps the time of day', () => {
    expect(businessDaysBefore(at('2026-11-11', '03:04:05.006'), 2)).toEqual(
      at('2026-11-09', '03:04:05.006')
    );
  });
});

describe('utcDay', () => {
  it('names the UTC day of a moment', () => {
    expect(utcDay(at('2026-11-11', '23:59:59.999'))).toBe('2026-11-11');
  });
});
