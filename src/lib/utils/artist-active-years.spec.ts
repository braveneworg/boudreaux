/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { formatArtistActiveYears } from './artist-active-years';

describe('formatArtistActiveYears', () => {
  it('returns null when no date is set', () => {
    expect(formatArtistActiveYears({ formedOn: null, bornOn: null, diedOn: null })).toBeNull();
  });

  it('formats a formation year for a band', () => {
    expect(
      formatArtistActiveYears({
        formedOn: new Date('2004-06-01T00:00:00.000Z'),
        bornOn: null,
        diedOn: null,
      })
    ).toBe('Formed 2004');
  });

  it('prefers the formation year when both formed and born dates are set', () => {
    expect(
      formatArtistActiveYears({
        formedOn: new Date('2004-06-01T00:00:00.000Z'),
        bornOn: new Date('1975-01-01T00:00:00.000Z'),
        diedOn: null,
      })
    ).toBe('Formed 2004');
  });

  it('formats a lifespan when both birth and death are set', () => {
    expect(
      formatArtistActiveYears({
        formedOn: null,
        bornOn: new Date('1975-01-01T00:00:00.000Z'),
        diedOn: new Date('2010-12-31T00:00:00.000Z'),
      })
    ).toBe('1975–2010');
  });

  it('formats a birth year alone', () => {
    expect(
      formatArtistActiveYears({
        formedOn: null,
        bornOn: new Date('1975-01-01T00:00:00.000Z'),
        diedOn: null,
      })
    ).toBe('b. 1975');
  });

  it('formats a death year alone', () => {
    expect(
      formatArtistActiveYears({
        formedOn: null,
        bornOn: null,
        diedOn: new Date('2010-12-31T00:00:00.000Z'),
      })
    ).toBe('d. 2010');
  });

  it('reads the year in UTC so a midnight-UTC day never shifts a year back', () => {
    expect(
      formatArtistActiveYears({
        formedOn: new Date('2010-01-01T00:00:00.000Z'),
        bornOn: null,
        diedOn: null,
      })
    ).toBe('Formed 2010');
  });
});
