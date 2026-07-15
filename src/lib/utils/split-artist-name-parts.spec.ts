/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { splitArtistNameParts } from './split-artist-name-parts';

describe('splitArtistNameParts', () => {
  it('returns all empty strings for single token "Prince"', () => {
    const result = splitArtistNameParts('Prince');
    expect(result).toEqual({
      firstName: 'Prince',
      middleName: '',
      surname: '',
      displayName: 'Prince',
    });
  });

  it('returns correct split for two tokens "Nick Cave"', () => {
    const result = splitArtistNameParts('Nick Cave');
    expect(result).toEqual({
      firstName: 'Nick',
      middleName: '',
      surname: 'Cave',
      displayName: 'Nick Cave',
    });
  });

  it('returns correct split for three tokens "Zora Quill Brandt"', () => {
    const result = splitArtistNameParts('Zora Quill Brandt');
    expect(result).toEqual({
      firstName: 'Zora',
      middleName: 'Quill',
      surname: 'Brandt',
      displayName: 'Zora Quill Brandt',
    });
  });

  it('returns correct split for four tokens "Mary Jane Watson Parker"', () => {
    const result = splitArtistNameParts('Mary Jane Watson Parker');
    expect(result).toEqual({
      firstName: 'Mary',
      middleName: 'Jane Watson',
      surname: 'Parker',
      displayName: 'Mary Jane Watson Parker',
    });
  });

  it('returns all empty strings for empty string input', () => {
    const result = splitArtistNameParts('');
    expect(result).toEqual({
      firstName: '',
      middleName: '',
      surname: '',
      displayName: '',
    });
  });

  it('returns all empty strings for whitespace-only input and collapses inner whitespace', () => {
    const result = splitArtistNameParts('  Nick   Cave ');
    expect(result).toEqual({
      firstName: 'Nick',
      middleName: '',
      surname: 'Cave',
      displayName: 'Nick Cave',
    });
  });
});
