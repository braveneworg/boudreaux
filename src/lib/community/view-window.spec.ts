/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { utcDayOf, viewWindowStart } from './view-window';

describe('viewWindowStart', () => {
  it('is thirty days before the moment, to the millisecond', () => {
    expect(viewWindowStart(new Date('2026-11-14T12:34:56.789Z'))).toEqual(
      new Date('2026-10-15T12:34:56.789Z')
    );
  });
});

describe('utcDayOf', () => {
  it('names the UTC day of a moment', () => {
    expect(utcDayOf(new Date('2026-11-14T12:00:00.000Z'))).toBe('2026-11-14');
  });

  it('keeps the last instant of a UTC day on that day', () => {
    expect(utcDayOf(new Date('2026-11-14T23:59:59.999Z'))).toBe('2026-11-14');
  });

  it('puts the first instant of the next UTC day on the next day', () => {
    expect(utcDayOf(new Date('2026-11-15T00:00:00.000Z'))).toBe('2026-11-15');
  });
});
