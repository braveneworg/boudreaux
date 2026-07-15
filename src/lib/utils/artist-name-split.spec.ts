/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { composeArtistString, splitFeaturedArtists } from './artist-name-split';

describe('splitFeaturedArtists', () => {
  it('returns a lone name as the single primary', () => {
    expect(splitFeaturedArtists('Ceschi')).toEqual([{ name: 'Ceschi', role: 'primary' }]);
  });

  it('splits on "feat."', () => {
    expect(splitFeaturedArtists('Ceschi feat. Sage Francis')).toEqual([
      { name: 'Ceschi', role: 'primary' },
      { name: 'Sage Francis', role: 'featured' },
    ]);
  });

  it('splits on "ft."', () => {
    expect(splitFeaturedArtists('Ceschi ft. Sage Francis')).toEqual([
      { name: 'Ceschi', role: 'primary' },
      { name: 'Sage Francis', role: 'featured' },
    ]);
  });

  it('splits on "featuring"', () => {
    expect(splitFeaturedArtists('Ceschi featuring Sage Francis')).toEqual([
      { name: 'Ceschi', role: 'primary' },
      { name: 'Sage Francis', role: 'featured' },
    ]);
  });

  it('matches the token case-insensitively', () => {
    expect(splitFeaturedArtists('Ceschi FEAT. Sage Francis')).toEqual([
      { name: 'Ceschi', role: 'primary' },
      { name: 'Sage Francis', role: 'featured' },
    ]);
  });

  it('splits a parenthesized feat token and drops the brackets', () => {
    expect(splitFeaturedArtists('Ceschi (feat. Sage Francis)')).toEqual([
      { name: 'Ceschi', role: 'primary' },
      { name: 'Sage Francis', role: 'featured' },
    ]);
  });

  it('splits a bracketed ft token and drops the brackets', () => {
    expect(splitFeaturedArtists('Ceschi [ft. Sage Francis]')).toEqual([
      { name: 'Ceschi', role: 'primary' },
      { name: 'Sage Francis', role: 'featured' },
    ]);
  });

  it('splits chained feat tokens into multiple featured names', () => {
    expect(splitFeaturedArtists('Ceschi feat. Sage Francis featuring Astronautalis')).toEqual([
      { name: 'Ceschi', role: 'primary' },
      { name: 'Sage Francis', role: 'featured' },
      { name: 'Astronautalis', role: 'featured' },
    ]);
  });

  it('never splits on an ampersand', () => {
    expect(splitFeaturedArtists('Simon & Garfunkel')).toEqual([
      { name: 'Simon & Garfunkel', role: 'primary' },
    ]);
  });

  it('never splits on an "x" collab separator', () => {
    expect(splitFeaturedArtists('Ceschi x Factor')).toEqual([
      { name: 'Ceschi x Factor', role: 'primary' },
    ]);
  });

  it('never splits on a comma', () => {
    expect(splitFeaturedArtists('Ceschi, Sage Francis')).toEqual([
      { name: 'Ceschi, Sage Francis', role: 'primary' },
    ]);
  });

  it('never splits on a plus sign', () => {
    expect(splitFeaturedArtists('Ceschi + Sage Francis')).toEqual([
      { name: 'Ceschi + Sage Francis', role: 'primary' },
    ]);
  });

  it('keeps a comma inside a featured segment intact', () => {
    expect(splitFeaturedArtists('Ceschi feat. Sage Francis, Astronautalis')).toEqual([
      { name: 'Ceschi', role: 'primary' },
      { name: 'Sage Francis, Astronautalis', role: 'featured' },
    ]);
  });

  it('does not split the mid-word "feat" in Featurecast', () => {
    expect(splitFeaturedArtists('Featurecast')).toEqual([{ name: 'Featurecast', role: 'primary' }]);
  });

  it('does not split the mid-word "feat" in The Featherlights', () => {
    expect(splitFeaturedArtists('The Featherlights')).toEqual([
      { name: 'The Featherlights', role: 'primary' },
    ]);
  });

  it('splits the word-boundary token in "Left ft. Right"', () => {
    expect(splitFeaturedArtists('Left ft. Right')).toEqual([
      { name: 'Left', role: 'primary' },
      { name: 'Right', role: 'featured' },
    ]);
  });

  it('does not split "ft." glued to the preceding word', () => {
    expect(splitFeaturedArtists('Loftft. Right')).toEqual([
      { name: 'Loftft. Right', role: 'primary' },
    ]);
  });

  it('treats a string that starts with a feat token as one primary (empty-primary edge)', () => {
    expect(splitFeaturedArtists('feat. Sage Francis')).toEqual([
      { name: 'feat. Sage Francis', role: 'primary' },
    ]);
  });

  it('trims surrounding whitespace from every name', () => {
    expect(splitFeaturedArtists('  Ceschi   feat.   Sage Francis  ')).toEqual([
      { name: 'Ceschi', role: 'primary' },
      { name: 'Sage Francis', role: 'featured' },
    ]);
  });

  it('dedupes a featured name equal to the primary, case-insensitively', () => {
    expect(splitFeaturedArtists('Ceschi feat. CESCHI')).toEqual([
      { name: 'Ceschi', role: 'primary' },
    ]);
  });

  it('dedupes repeated featured names, case-insensitively', () => {
    expect(splitFeaturedArtists('Ceschi feat. Sage Francis ft. sage francis')).toEqual([
      { name: 'Ceschi', role: 'primary' },
      { name: 'Sage Francis', role: 'featured' },
    ]);
  });

  it('does not split a trailing token with no name after it', () => {
    expect(splitFeaturedArtists('Ceschi feat. ')).toEqual([
      { name: 'Ceschi feat.', role: 'primary' },
    ]);
  });

  it('drops an empty featured segment when a token is followed only by a bracket', () => {
    expect(splitFeaturedArtists('Ceschi (feat. )')).toEqual([{ name: 'Ceschi', role: 'primary' }]);
  });

  it('returns an empty array for an empty string', () => {
    expect(splitFeaturedArtists('')).toEqual([]);
  });

  it('returns an empty array for a whitespace-only string', () => {
    expect(splitFeaturedArtists('   ')).toEqual([]);
  });
});

describe('composeArtistString', () => {
  it('returns the primary alone when there are no featured', () => {
    expect(composeArtistString('X', [])).toBe('X');
  });
  it('joins a single featured with a feat. token', () => {
    expect(composeArtistString('X', ['Y'])).toBe('X feat. Y');
  });
  it('joins multiple featured each with its own feat. token', () => {
    expect(composeArtistString('X', ['Y', 'Z'])).toBe('X feat. Y feat. Z');
  });
  it('round-trips through splitFeaturedArtists', () => {
    const composed = composeArtistString('X', ['Y', 'Z']);
    const parts = splitFeaturedArtists(composed);
    expect(parts).toEqual([
      { name: 'X', role: 'primary' },
      { name: 'Y', role: 'featured' },
      { name: 'Z', role: 'featured' },
    ]);
  });
  it('trims and drops empty featured entries', () => {
    expect(composeArtistString('  X  ', [' Y ', '', '  '])).toBe('X feat. Y');
  });
  it('returns an empty string for an empty primary', () => {
    expect(composeArtistString('', ['Y'])).toBe('');
  });
});
